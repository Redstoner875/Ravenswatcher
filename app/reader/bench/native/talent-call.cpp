#include "talent-hook.h"
#include <stdlib.h>
#include <errno.h>

struct Window { DWORD pid; HWND hwnd; DWORD tid; unsigned long long area; };
static BOOL CALLBACK findWindow(HWND hwnd, LPARAM data) {
  auto& w = *(Window*)data;
  DWORD pid = 0, tid = GetWindowThreadProcessId(hwnd, &pid);
  RECT rect{};
  if (pid == w.pid && IsWindowVisible(hwnd) && !GetWindow(hwnd, GW_OWNER)
      && GetClientRect(hwnd, &rect) && rect.right >= 320 && rect.bottom >= 200) {
    auto area = (unsigned long long)rect.right * rect.bottom;
    if (area > w.area) { w.hwnd = hwnd; w.tid = tid; w.area = area; }
  }
  return TRUE;
}
static bool number(const wchar_t* s, uintptr_t& value) {
  wchar_t* end = nullptr;
  errno = 0;
  value = _wcstoui64(s, &end, 16);
  return s[0] && end && !*end && !errno;
}
int wmain(int argc, wchar_t** argv) {
  if (argc != 15) { fputs("Use the talent-rarity-edit.js launcher.\n", stderr); return 2; }
  uintptr_t v[13]{};
  for (int i = 0; i < 13; ++i)
    if (!number(argv[i + 1], v[i])) { fputs("Invalid request.\n", stderr); return 2; }
  if (!v[0] || v[0] > MAXDWORD || v[11] > 3 || v[12] > 3 || wcslen(argv[14]) != 32) return 2;
  Request initial{};
  initial.version = kProtocol; initial.pid = (DWORD)v[0]; initial.module = v[1];
  initial.runtime = v[2]; initial.controller = v[3]; initial.entity = v[4];
  initial.context = v[5]; initial.definition = v[6]; initial.rarityAddress = v[7];
  initial.runtimeVtable = v[8]; initial.controllerVtable = v[9]; initial.definitionVtable = v[10];
  initial.expected = (int)v[11]; initial.desired = (int)v[12]; initial.actual = -1;
  for (int i = 0; i < 16; ++i) {
    wchar_t pair[3] = { argv[14][i * 2], argv[14][i * 2 + 1], 0 };
    uintptr_t byte = 0;
    if (!number(pair, byte) || byte > 255) return 2;
    initial.guid[i] = (unsigned char)byte;
  }
  Window window{ initial.pid };
  EnumWindows(findWindow, (LPARAM)&window);
  if (!window.tid) { fputs("Game window unavailable; nothing written.\n", stderr); return 2; }
  initial.tid = window.tid;
  // One dispatcher per game, including competing command invocations.
  wchar_t mutexName[100];
  swprintf_s(mutexName, L"Local\\RavenswatcherTalentsBusy-%lu", initial.pid);
  HANDLE mutex = CreateMutexW(nullptr, TRUE, mutexName);
  if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
    if (mutex) CloseHandle(mutex);
    fputs("A talent dispatcher is already active; nothing written.\n", stderr); return 2;
  }
  LARGE_INTEGER clock{}; QueryPerformanceCounter(&clock);
  initial.cookie = (ULONG_PTR)(clock.QuadPart ^ ((uint64_t)GetCurrentProcessId() << 32));
  if (!initial.cookie) initial.cookie = 1;
  wchar_t name[128]; mappingName(name, _countof(name), initial.pid, initial.cookie);
  HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(Request), name);
  DWORD mappingError = GetLastError();
  Request* request = mapping ? (Request*)MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Request)) : nullptr;
  wchar_t dllPath[32768];
  DWORD length = GetModuleFileNameW(nullptr, dllPath, _countof(dllPath));
  wchar_t* last = length && length < _countof(dllPath) ? wcsrchr(dllPath, L'\\') : nullptr;
  HMODULE dll = nullptr; HHOOK hook = nullptr;
  int result = 2;
  if (!request || mappingError == ERROR_ALREADY_EXISTS || !last) goto cleanup;
  wcscpy_s(last + 1, _countof(dllPath) - (last + 1 - dllPath), L"talent-hook.dll");
  *request = initial;
  dll = LoadLibraryExW(dllPath, nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!dll) goto cleanup;
  {
    auto proc = (HOOKPROC)GetProcAddress(dll, "TalentHook");
    UINT message = RegisterWindowMessageW(kMessage);
    if (!proc || !message) goto cleanup;
    hook = SetWindowsHookExW(WH_GETMESSAGE, proc, dll, window.tid);
    if (!hook || !PostThreadMessageW(window.tid, message, initial.cookie, 0)) goto cleanup;
    ULONGLONG deadline = GetTickCount64() + 10000;
    LONG state;
    do {
      state = InterlockedCompareExchange(&request->state, Pending, Pending);
      if (state != Pending && state != Running) break;
      Sleep(10);
    } while (GetTickCount64() < deadline);
    if (state == Pending) state = InterlockedCompareExchange(&request->state, Cancelled, Pending);
    if (state == Done) {
      printf("{\"current\":%d,\"engine_setter_completed\":true,\"window_thread\":%lu,\"gameplay_verified\":false}\n",
        request->actual, window.tid);
      result = 0;
    } else if (state == Rejected || state == Pending || state == Cancelled) {
      fputs("Dispatcher rejected or cancelled the request before the setter; nothing written.\n", stderr);
    } else {
      fputs("Setter faulted or did not finish before timeout. Changes may remain or complete later. Do not retry this run.\n", stderr);
      result = 3;
    }
  }
cleanup:
  if (hook) UnhookWindowsHookEx(hook);
  if (dll) FreeLibrary(dll);
  if (request) UnmapViewOfFile(request);
  if (mapping) CloseHandle(mapping);
  ReleaseMutex(mutex); CloseHandle(mutex);
  if (result == 2) fputs("Dispatcher did not complete.\n", stderr);
  return result;
}
