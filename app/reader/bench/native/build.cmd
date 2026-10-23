@echo off
setlocal
cd /d "%~dp0"
if not exist bin mkdir bin
cl /nologo /std:c++17 /W4 /WX /wd4191 /O2 /MT /LD /EHsc talent-hook.cpp /link /OUT:bin\talent-hook.dll user32.lib
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /W4 /WX /wd4191 /O2 /MT /EHsc talent-call.cpp /link /OUT:bin\talent-call.exe user32.lib
if errorlevel 1 exit /b 1
if not exist bin\test mkdir bin\test
copy /y bin\talent-call.exe bin\test\talent-call.exe >nul
cl /nologo /std:c++17 /W4 /WX /wd4191 /O2 /MT /LD /EHsc /DTALENT_HOOK_TEST talent-hook.cpp /link /OUT:bin\test\talent-hook.dll user32.lib
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /W4 /WX /wd4191 /O2 /MT /EHsc test-fixture.cpp /link /OUT:bin\test\test-fixture.exe user32.lib
if errorlevel 1 exit /b 1
