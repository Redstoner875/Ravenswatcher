#pragma once
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <stdio.h>

// Source-only experiment. Fixed operation; no arbitrary address-to-call API.
constexpr DWORD kProtocol = 1;
constexpr wchar_t kMessage[] = L"Ravenswatcher.TalentRarity.20261023.1";
enum State : LONG { Pending, Running, Done, Rejected, Faulted, Cancelled };
struct Request {
  DWORD version, pid, tid;
  ULONG_PTR cookie;
  volatile LONG state;
  DWORD exception;
  uintptr_t module, runtime, controller, entity, context, definition, rarityAddress;
  uintptr_t runtimeVtable, controllerVtable, definitionVtable;
  int expected, desired, actual;
  unsigned char guid[16];
};
inline void mappingName(wchar_t* name, size_t count, DWORD pid, ULONG_PTR cookie) {
  swprintf_s(name, count, L"Local\\RavenswatcherTalents-%lu-%llx", pid, (unsigned long long)cookie);
}
