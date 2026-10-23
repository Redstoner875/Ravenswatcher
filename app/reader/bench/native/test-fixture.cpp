#include "talent-hook.h"
#include <string.h>
static unsigned char runtime[0x200], controller[0x2000], entity[0x200], definition[0x100];
static uintptr_t members[1];
static int rarity = 0;
static DWORD ownerThread;
extern "C" __declspec(dllexport) void __fastcall FixtureSetter(void* object, int desired) {
  if (object != runtime || GetCurrentThreadId() != ownerThread) ExitProcess(55);
  rarity = desired;
  printf("{\"fixture_effect\":%d,\"correct_thread\":true}\n", desired + 1); fflush(stdout);
}
static LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
  return DefWindowProcW(hwnd, msg, w, l);
}
int wmain(int argc, wchar_t** argv) {
  const bool stale = argc > 1 && !wcscmp(argv[1], L"stale");
  const bool cancel = argc > 1 && !wcscmp(argv[1], L"cancel");
  ownerThread = GetCurrentThreadId();
  auto set = [](unsigned char* at, uintptr_t value) { *(uintptr_t*)at = value; };
  // Deliberate dummy vtables. Production is separately protected by exact RTTI + hash.
  set(runtime, (uintptr_t)runtime); set(controller, (uintptr_t)controller);
  set(definition, (uintptr_t)definition); set(definition + 0x18, (uintptr_t)definition);
  set(runtime + 8, (uintptr_t)entity); set(runtime + 0x10, (uintptr_t)definition);
  set(runtime + 0x68, (uintptr_t)&rarity); set(runtime + 0x78, (uintptr_t)controller);
  set(controller + 8, (uintptr_t)entity); set(controller + 0x1008, (uintptr_t)runtime);
  set(entity + 0x30, (uintptr_t)entity); members[0] = (uintptr_t)runtime;
  set(entity + 0x190, (uintptr_t)members);
  *(unsigned*)(entity + 0x198) = 1; *(unsigned*)(entity + 0x19c) = 1;
  memset(definition + 0x88, 0xab, 16);
  WNDCLASSW cls{}; cls.lpfnWndProc = windowProc; cls.hInstance = GetModuleHandleW(nullptr);
  cls.lpszClassName = L"RavenswatcherTalentFixture";
  if (!RegisterClassW(&cls)) return 1;
  HWND window = CreateWindowW(cls.lpszClassName, L"Ravenswatcher fixture", WS_OVERLAPPEDWINDOW,
    0, 0, 640, 480, nullptr, nullptr, cls.hInstance, nullptr);
  if (!window) return 1;
  ShowWindow(window, SW_SHOW);
  uintptr_t values[] = { GetCurrentProcessId(), (uintptr_t)cls.hInstance, (uintptr_t)runtime,
    (uintptr_t)controller, (uintptr_t)entity, (uintptr_t)entity, (uintptr_t)definition,
    (uintptr_t)&rarity, (uintptr_t)runtime, (uintptr_t)controller, (uintptr_t)definition, 0, 3 };
  printf("{\"args\":[");
  for (unsigned i = 0; i < _countof(values); ++i) printf("%s\"%llx\"", i ? "," : "", (unsigned long long)values[i]);
  puts(",\"abababababababababababababababab\"]}"); fflush(stdout);
  if (stale) rarity = 1;
  if (cancel) {
    Sleep(12000);
    MSG msg;
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    printf("{\"cancelled_rarity\":%d}\n", rarity); fflush(stdout);
  }
  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
  return 0;
}
