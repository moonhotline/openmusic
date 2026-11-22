#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}

const BLOCK_BYTES: usize = 32 * 1024;

// The host writes, processes, and copies out each block synchronously.
static mut BLOCK: [u8; BLOCK_BYTES] = [0; BLOCK_BYTES];

#[no_mangle]
pub extern "C" fn block_ptr() -> *mut u8 {
    core::ptr::addr_of_mut!(BLOCK).cast()
}

#[no_mangle]
pub extern "C" fn block_size() -> usize {
    BLOCK_BYTES
}

#[no_mangle]
pub extern "C" fn apply_gain(length: usize, gain_q16: u32) -> bool {
    if length > BLOCK_BYTES || length % 2 != 0 {
        return false;
    }

    // The bound above keeps the slice inside the staging block.
    let block = unsafe { core::slice::from_raw_parts_mut(block_ptr(), length) };
    for sample in block.chunks_exact_mut(2) {
        let product = i16::from_le_bytes([sample[0], sample[1]]) as i64 * i64::from(gain_q16);
        let rounded = (product + if product < 0 { 32_767 } else { 32_768 }) >> 16;
        let output = rounded.clamp(i16::MIN as i64, i16::MAX as i64) as i16;
        sample.copy_from_slice(&output.to_le_bytes());
    }
    true
}
