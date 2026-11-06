# Uruchamia polecenie na osobnym, niewidocznym pulpicie Windows.
# Pulpit ma własny fokus, więc okna i aktywacja nie dotykają tego, nad czym pracujesz.
# Procesy potomne dziedziczą pulpit, dlatego Electron trafia tu bez zmian w apce.
# Okno poza ekranem nie wystarczy: webContents.focus() i tak je aktywuje i zabiera klawiaturę.
param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class HiddenDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct StartupInfo {
    public int cb;
    public string reserved;
    public string desktop;
    public string title;
    public int x, y, xSize, ySize, xChars, yChars, fill, flags;
    public short showWindow, reserved2;
    public IntPtr reserved3, stdIn, stdOut, stdErr;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct ProcessInfo {
    public IntPtr process, thread;
    public int processId, threadId;
  }

  const uint GENERIC_ALL = 0x10000000;
  const uint INFINITE = 0xFFFFFFFF;
  const int STARTF_USESTDHANDLES = 0x100;

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktopW(string name, IntPtr device, IntPtr mode, int flags, uint access, IntPtr attributes);

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool CloseDesktop(IntPtr desktop);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
    bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetExitCodeProcess(IntPtr process, out int code);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool CloseHandle(IntPtr handle);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr GetStdHandle(int which);

  public static int Run(string name, string command, string directory) {
    IntPtr desktop = CreateDesktopW(name, IntPtr.Zero, IntPtr.Zero, 0, GENERIC_ALL, IntPtr.Zero);
    if (desktop == IntPtr.Zero) throw new Win32Exception();
    try {
      StartupInfo startup = new StartupInfo();
      startup.cb = Marshal.SizeOf(typeof(StartupInfo));
      startup.desktop = name;
      startup.flags = STARTF_USESTDHANDLES;
      startup.stdIn = GetStdHandle(-10);
      startup.stdOut = GetStdHandle(-11);
      startup.stdErr = GetStdHandle(-12);

      ProcessInfo process;
      if (!CreateProcessW(null, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, directory, ref startup, out process))
        throw new Win32Exception();
      try {
        WaitForSingleObject(process.process, INFINITE);
        int code;
        if (!GetExitCodeProcess(process.process, out code)) throw new Win32Exception();
        return code;
      } finally {
        CloseHandle(process.process);
        CloseHandle(process.thread);
      }
    } finally {
      CloseDesktop(desktop);
    }
  }
}
'@

$quoted = $Command | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }
$name = "htmldocs-e2e-$PID"
exit [HiddenDesktop]::Run($name, ($quoted -join ' '), (Get-Location).Path)
