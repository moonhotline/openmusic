import { Conflict, decide, freshWorkspace, submitProposal } from "../../packages/score/index.ts";
import type { Workspace } from "../../packages/score/index.ts";
import { score } from "../../examples/glass-meridian/score.ts";

interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
interface ProjectState { storage: Store & { transaction<T>(operation: (store: Store) => Promise<T>): Promise<T> } }
interface Env {
  PROJECT: { idFromName(name: string): object; get(id: object): { fetch(request: Request): Promise<Response> } };
  AUDIO?: { fetch(request: Request): Promise<Response> };
  AGENT_TOKEN?: string;
  REVIEW_TOKEN?: string;
  STUDIO_ORIGINS?: string;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON body required");
  const decoder = new TextDecoder();
  let bytes = 0;
  let data = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.length;
    if (bytes > 48 * 1024) {
      await reader.cancel();
      throw new Error("Proposal exceeds 48 KiB");
    }
    data += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(data + decoder.decode());
}

function matches(value: string | null, configured: string | undefined) {
  if (!configured || configured.length < 24 || value?.length !== configured.length + 7) return false;
  const target = "Bearer " + configured;
  let mismatch = 0;
  for (let i = 0; i < target.length; i++) mismatch |= target.charCodeAt(i) ^ value.charCodeAt(i);
  return mismatch === 0;
}

export class MusicProject {
  constructor(privateState: ProjectState) { this.state = privateState; }
  private readonly state: ProjectState;

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/v1/project") {
      return json(await this.state.storage.get<Workspace>("project") ?? freshWorkspace(score));
    }
    try {
      const input = await body(request);
      const action = (current: Workspace) => {
        if (path === "/v1/proposals") return submitProposal(current, input);
        if (!input || typeof input !== "object" || !("id" in input) || !("accepted" in input)) throw new Error("Invalid decision");
        return decide(current, input.id, input.accepted);
      };
      const next = await this.state.storage.transaction(async (store) => {
        const current = await store.get<Workspace>("project") ?? freshWorkspace(score);
        const updated = action(current);
        if (current !== updated) await store.put("project", updated);
        return updated;
      });
      return json(next);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Request failed" }, error instanceof Conflict ? 409 : 400);
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") return json({ status: "ok", service: "openmusic" });
    const origin = request.headers.get("origin");
    const allowOrigin = !!origin && Boolean(env.STUDIO_ORIGINS?.split(",").map((item) => item.trim()).includes(origin));
    const headers = new Headers({ Vary: "Origin" });
    if (allowOrigin) {
      headers.set("Access-Control-Allow-Origin", origin!);
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Sample-Rate, X-Channels");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Expose-Headers", "X-Sample-Rate, X-Channels");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: allowOrigin ? 204 : 403, headers });
    const withCors = (response: Response) => {
      const result = new Response(response.body, response);
      headers.forEach((value, name) => result.headers.set(name, value));
      return result;
    };

    const view = path === "/v1/project" && request.method === "GET";
    const propose = path === "/v1/proposals" && request.method === "POST";
    const review = path === "/v1/decision" && request.method === "POST";
    const audio = path === "/v1/audio/pcm" && request.method === "POST";
    if (!view && !propose && !review && !audio) return withCors(json({ error: "Not found" }, 404));
    if (origin && !allowOrigin) return withCors(json({ error: "Origin not allowed" }, 403));
    const token = request.headers.get("authorization");
    const isAgent = matches(token, env.AGENT_TOKEN);
    const isReviewer = matches(token, env.REVIEW_TOKEN);
    if (((view || audio) && !isAgent && !isReviewer) || (propose && !isAgent) || (review && !isReviewer)) {
      return withCors(json({ error: "Unauthorized for this action" }, 401));
    }
    if (audio) {
      if (!env.AUDIO) return withCors(json({ error: "Audio processing is unavailable" }, 503));
      const stream = new Request(request);
      stream.headers.delete("Authorization");
      return withCors(await env.AUDIO.fetch(stream));
    }
    return withCors(await env.PROJECT.get(env.PROJECT.idFromName("glass-meridian")).fetch(request));
  },
};
