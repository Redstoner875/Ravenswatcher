#include "talent-hook.h"
#include <string.h>

static bool valid(const Request& r) {
  if (r.version != kProtocol || r.pid != GetCurrentProcessId() || r.tid != GetCurrentThreadId()
      || r.expected < 0 || r.expected > 3 || r.desired < 0 || r.desired > 3
      || r.module != (uintptr_t)GetModuleHandleW(nullptr)) return false;
  // Measured executable only. The JS launcher additionally verifies its full SHA-256.
#ifndef TALENT_HOOK_TEST
  static const unsigned char start[] = {
    0x40,0x57,0x48,0x83,0xec,0x20,0x48,0x8b,0x41,0x68,0x4c,0x8b,0xc9,0x89,0x10,
    0x48,0x8b,0x79,0x78,0x48,0x85,0xff };
  static const unsigned char end[] = {
    0x49,0x8b,0x41,0x68,0x49,0x8b,0xc9,0x8b,0x10,0x48,0x83,0xc4,0x20,
    0x5f,0xe9,0x54,0x10,0x00,0x00 };
  if (memcmp((void*)(r.module + 0x2e87b0), start, sizeof(start))
      || memcmp((void*)(r.module + 0x2e88d9), end, sizeof(end))) return false;
#else
  if (!GetProcAddress((HMODULE)r.module, "FixtureSetter")) return false;
#endif
  auto ptr = [](uintptr_t p) { return *(uintptr_t*)p; };
  if (ptr(r.runtime) != r.runtimeVtable || ptr(r.controller) != r.controllerVtable
      || ptr(r.definition) != r.definitionVtable
      || ptr(r.runtime + 8) != r.entity || ptr(r.runtime + 0x10) != r.definition
      || ptr(r.runtime + 0x68) != r.rarityAddress || ptr(r.runtime + 0x78) != r.controller
      || ptr(r.controller + 8) != r.entity || ptr(r.entity + 0x30) != r.context
      || ptr(r.definition + 0x18) != r.definition
      || memcmp((void*)(r.definition + 0x88), r.guid, 16)
      || *(int*)r.rarityAddress != r.expected) return false;
  // It must still be selected in this hero's live ten talent slots.
  bool selected = false;
  for (unsigned i = 0; i < 10; ++i)
    if (ptr(r.controller + 0x1008 + i * 0x20) == r.runtime) selected = true;
  if (!selected) return false;
  uintptr_t entries = ptr(r.entity + 0x190);
  unsigned count = *(unsigned*)(r.entity + 0x198);
  unsigned capacity = *(unsigned*)(r.entity + 0x19c);
  if (!entries || count > capacity || capacity > 10000) return false;
  for (unsigned i = 0; i < count; ++i)
    if (ptr(entries + i * 8) == r.runtime) return true;
  return false;
}

// Only the target window thread receives the registered private message.
// No engine calls or game-memory changes occur in DllMain or on a remote thread.
extern "C" __declspec(dllexport) LRESULT CALLBACK TalentHook(int code, WPARAM removed, LPARAM data) {
  if (code >= 0 && removed == PM_REMOVE) {
    const MSG* msg = (const MSG*)data;
    if (msg->message == RegisterWindowMessageW(kMessage) && msg->wParam) {
      wchar_t name[128];
      mappingName(name, _countof(name), GetCurrentProcessId(), msg->wParam);
      HANDLE mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name);
      if (mapping) {
        Request* request = (Request*)MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Request));
        if (request) {
          if (request->cookie == msg->wParam
              && InterlockedCompareExchange(&request->state, Running, Pending) == Pending) {
            bool called = false;
            __try {
              Request r = *request;
              if (!valid(r)) InterlockedExchange(&request->state, Rejected);
              else {
                called = true;
                using Setter = void(__fastcall*)(void*, int);
#ifdef TALENT_HOOK_TEST
                auto setter = (Setter)GetProcAddress((HMODULE)r.module, "FixtureSetter");
#else
                auto setter = (Setter)(r.module + 0x2e87b0);
#endif
                setter((void*)r.runtime, r.desired);
                request->actual = *(int*)r.rarityAddress;
                InterlockedExchange(&request->state, request->actual == r.desired ? Done : Faulted);
              }
            } __except(EXCEPTION_EXECUTE_HANDLER) {
              request->exception = GetExceptionCode();
              InterlockedExchange(&request->state, called ? Faulted : Rejected);
            }
          }
          UnmapViewOfFile(request);
        }
        CloseHandle(mapping);
      }
    }
  }
  return CallNextHookEx(nullptr, code, removed, data);
}
BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) { return TRUE; }
