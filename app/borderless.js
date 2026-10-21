'use strict';

// Window styles only. The game's process handle and memory reader stay read-only.
function createBorderlessController(native) {
  let saved = null;
  return {
    get pid() { return saved?.applied ? saved.pid : null; },
    apply(pid) {
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Start Ravenswatch and choose Windowed first.');
      if (saved?.applied && saved.pid === pid && native.valid(saved.handle, pid)) return;
      this.restore();
      const handle = native.find(pid);
      if (!handle) throw new Error('Game window not found. Choose Windowed in Ravenswatch, then try again.');
      const original = native.snapshot(handle);
      saved = { handle, pid, original, applied: false };
      try { native.borderless(handle); saved.applied = true; }
      catch (error) { this.restore(); throw error; }
    },
    restore() {
      if (!saved) return;
      if (native.valid(saved.handle, saved.pid)) native.restore(saved.handle, saved.original);
      saved = null;
    },
  };
}

function createWindowsNative() {
  const koffi = require('koffi');
  const user = koffi.load('user32.dll');
  const bind = (name, result, args) => user.func('__stdcall', name, result, args);
  const Callback = koffi.proto('bool __stdcall RavenswatchEnumWindow(void *hwnd, intptr_t data)');
  const EnumWindows = bind('EnumWindows', 'bool', [koffi.pointer(Callback), 'intptr_t']);
  const GetWindowThreadProcessId = bind('GetWindowThreadProcessId', 'uint32', ['void *', koffi.out(koffi.pointer('uint32'))]);
  const IsWindow = bind('IsWindow', 'bool', ['void *']);
  const IsWindowVisible = bind('IsWindowVisible', 'bool', ['void *']);
  const GetWindow = bind('GetWindow', 'void *', ['void *', 'uint32']);
  const GetWindowRect = bind('GetWindowRect', 'bool', ['void *', 'void *']);
  const GetWindowPlacement = bind('GetWindowPlacement', 'bool', ['void *', 'void *']);
  const SetWindowPlacement = bind('SetWindowPlacement', 'bool', ['void *', 'void *']);
  const GetWindowLongPtr = bind('GetWindowLongPtrW', 'intptr_t', ['void *', 'int']);
  const SetWindowLongPtr = bind('SetWindowLongPtrW', 'intptr_t', ['void *', 'int', 'intptr_t']);
  const SetWindowPos = bind('SetWindowPos', 'bool', ['void *', 'void *', 'int', 'int', 'int', 'int', 'uint32']);
  const ShowWindow = bind('ShowWindow', 'bool', ['void *', 'int']);
  const MonitorFromWindow = bind('MonitorFromWindow', 'void *', ['void *', 'uint32']);
  const GetMonitorInfo = bind('GetMonitorInfoW', 'bool', ['void *', 'void *']);
  const kernel = koffi.load('kernel32.dll');
  const GetLastError = kernel.func('__stdcall', 'GetLastError', 'uint32', []);
  const SetLastError = kernel.func('__stdcall', 'SetLastError', 'void', ['uint32']);
  function pidOf(handle) { const pid = [0]; GetWindowThreadProcessId(handle, pid); return pid[0]; }
  function rect(bytes, offset = 0) {
    const x = bytes.readInt32LE(offset), y = bytes.readInt32LE(offset + 4);
    return { x, y, width: bytes.readInt32LE(offset + 8) - x, height: bytes.readInt32LE(offset + 12) - y };
  }
  function style(handle, value) {
    SetLastError(0);
    const previous = SetWindowLongPtr(handle, -16, value);
    if (Number(previous) === 0 && GetLastError() !== 0) throw new Error('Windows could not change the game window style.');
  }
  function place(handle, bounds) {
    if (!SetWindowPos(handle, null, bounds.x, bounds.y, bounds.width, bounds.height, 0x4034)) {
      throw new Error('Windows could not resize the game window.');
    }
  }
  return {
    valid: (handle, pid) => !!IsWindow(handle) && pidOf(handle) === pid,
    find(pid) {
      let best = null, area = 0;
      const callback = koffi.register(handle => {
        if (pidOf(handle) !== pid || !IsWindowVisible(handle) || GetWindow(handle, 4)) return true;
        const bytes = Buffer.alloc(16);
        if (GetWindowRect(handle, bytes)) {
          const r = rect(bytes), size = r.width * r.height;
          if (r.width > 100 && r.height > 100 && size > area) { best = handle; area = size; }
        }
        return true;
      }, koffi.pointer(Callback));
      try { EnumWindows(callback, 0); } finally { koffi.unregister(callback); }
      return best;
    },
    snapshot(handle) {
      const bytes = Buffer.alloc(16), placement = Buffer.alloc(44); placement.writeUInt32LE(44);
      if (!GetWindowRect(handle, bytes) || !GetWindowPlacement(handle, placement)) throw new Error('Could not save the game window position.');
      return { style: Number(GetWindowLongPtr(handle, -16)) >>> 0, bounds: rect(bytes), placement };
    },
    borderless(handle) {
      const info = Buffer.alloc(40); info.writeUInt32LE(40);
      if (!GetMonitorInfo(MonitorFromWindow(handle, 2), info)) throw new Error('Game monitor not found.');
      // MonitorInfo is in physical pixels, as are SetWindowPos's coordinates.
      ShowWindow(handle, 9);
      const original = Number(GetWindowLongPtr(handle, -16)) >>> 0;
      style(handle, ((original & ~0x00cf0000) | 0x80000000) >>> 0);
      place(handle, rect(info, 4));
    },
    restore(handle, original) {
      style(handle, original.style);
      place(handle, original.bounds);
      if (!SetWindowPlacement(handle, original.placement)) throw new Error('Windows could not restore the game window position.');
    },
  };
}
module.exports = { createBorderlessController, createWindowsNative };
