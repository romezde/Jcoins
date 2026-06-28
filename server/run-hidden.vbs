Option Explicit

Dim shell, command, scriptPath
If WScript.Arguments.Count < 1 Then WScript.Quit 1

scriptPath = WScript.Arguments(0)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & scriptPath & Chr(34)
Set shell = CreateObject("WScript.Shell")
WScript.Quit shell.Run(command, 0, True)
