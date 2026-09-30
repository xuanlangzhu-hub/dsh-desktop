using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// Runtime branding only: the official EXE and app.asar are never changed.
internal static class WhaleDesktopIcon
{
    private const uint SetIcon = 0x0080, GetIcon = 0x007F;
    private static volatile bool stopping;
    private static readonly Guid AppPropertyFormat = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    private static readonly uint[] PropertyIds = { 2, 3, 4, 5 }; // command, icon, name, AppID

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey
    {
        public Guid Format;
        public uint Id;
        public PropertyKey(uint id) { Format = AppPropertyFormat; Id = id; }
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort Type;
        [FieldOffset(8)] public IntPtr Pointer;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }

    private delegate bool EnumWindowCallback(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowCallback callback, IntPtr data);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr LoadImage(IntPtr instance, string name, uint type, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropVariant value);

    private static IntPtr Message(IntPtr window, uint message, int kind, IntPtr icon)
    {
        IntPtr result;
        if (SendMessageTimeout(window, message, new IntPtr(kind), icon, 2, 500, out result) == IntPtr.Zero)
            throw new InvalidOperationException("The desktop window did not respond to an icon message.");
        return result;
    }

    private static string ReadProperty(IPropertyStore store, uint id)
    {
        var key = new PropertyKey(id);
        PropVariant value;
        Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
        try {
            if (value.Type == 0) return null;
            if (value.Type != 31) throw new InvalidOperationException("Unexpected window property type.");
            return Marshal.PtrToStringUni(value.Pointer);
        } finally { PropVariantClear(ref value); }
    }

    private static void WriteProperty(IPropertyStore store, uint id, string text)
    {
        var key = new PropertyKey(id);
        var value = new PropVariant();
        if (text != null) { value.Type = 31; value.Pointer = Marshal.StringToCoTaskMemUni(text); }
        try { Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref value)); }
        finally { PropVariantClear(ref value); }
    }

    private sealed class WindowBranding : IDisposable
    {
        public IntPtr Window;
        private IntPtr big, small, originalBig, originalSmall;
        private IPropertyStore store;
        private readonly Dictionary<uint, string> originals = new Dictionary<uint, string>();

        public WindowBranding(IntPtr window, string executable, string iconPath)
        {
            Window = window;
            try {
                var iid = typeof(IPropertyStore).GUID;
                Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window, ref iid, out store));
                foreach (uint id in PropertyIds) originals[id] = ReadProperty(store, id);
                if (!String.IsNullOrEmpty(originals[5]) && originals[5] != "com.deepseek.dsh")
                    throw new InvalidOperationException("The window belongs to a different application identity.");
                originalBig = Message(window, GetIcon, 1, IntPtr.Zero);
                originalSmall = Message(window, GetIcon, 0, IntPtr.Zero);
                big = LoadImage(IntPtr.Zero, iconPath, 1, 32, 32, 0x10);
                small = LoadImage(IntPtr.Zero, iconPath, 1, 16, 16, 0x10);
                if (big == IntPtr.Zero || small == IntPtr.Zero) throw new InvalidOperationException("Could not load the Whale icon.");
                WriteProperty(store, 2, "\"" + executable + "\"");
                WriteProperty(store, 3, iconPath + ",0");
                WriteProperty(store, 4, "DeepSeek Harness");
                Message(window, SetIcon, 1, big);
                Message(window, SetIcon, 0, small);
                // Set identity last so the taskbar refresh sees all relaunch properties.
                WriteProperty(store, 5, "com.deepseek.dsh");
                Marshal.ThrowExceptionForHR(store.Commit());
                if (Message(window, GetIcon, 1, IntPtr.Zero) != big ||
                    Message(window, GetIcon, 0, IntPtr.Zero) != small ||
                    ReadProperty(store, 3) != iconPath + ",0" || ReadProperty(store, 5) != "com.deepseek.dsh")
                    throw new InvalidOperationException("Runtime icon verification failed.");
            } catch { Dispose(); throw; }
        }

        public void SaveVerifiedIcon(string path)
        {
            using (Icon icon = Icon.FromHandle(Message(Window, GetIcon, 1, IntPtr.Zero)))
            using (Bitmap bitmap = icon.ToBitmap()) bitmap.Save(path, ImageFormat.Png);
        }

        public void Dispose()
        {
            if (IsWindow(Window)) {
                try {
                    if (big != IntPtr.Zero) Message(Window, SetIcon, 1, originalBig);
                    if (small != IntPtr.Zero) Message(Window, SetIcon, 0, originalSmall);
                    if (store != null && originals.Count == PropertyIds.Length) {
                        foreach (uint id in PropertyIds) WriteProperty(store, id, originals[id]);
                        Marshal.ThrowExceptionForHR(store.Commit());
                    }
                } catch (Exception error) { Console.Error.WriteLine(error.Message); }
            }
            if (store != null) { Marshal.ReleaseComObject(store); store = null; }
            if (big != IntPtr.Zero) { DestroyIcon(big); big = IntPtr.Zero; }
            if (small != IntPtr.Zero) { DestroyIcon(small); small = IntPtr.Zero; }
        }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        try {
            if (args.Length == 2 && args[0] == "--self-test") return SelfTest(Path.GetFullPath(args[1]));
            if (args.Length != 4) throw new ArgumentException("Expected shell PID, exact executable, icon path, and status directory.");
            int shellPid = Int32.Parse(args[0]);
            string executable = Path.GetFullPath(args[1]), icon = Path.GetFullPath(args[2]);
            string statusDirectory = Path.GetFullPath(args[3]);
            if (Path.GetFileName(executable) != "DeepSeek Harness.exe" || !File.Exists(icon))
                throw new InvalidOperationException("Not an official Desktop executable or icon.");
            using (Process shell = Process.GetProcessById(shellPid)) {
                if (!String.Equals(shell.MainModule.FileName, executable, StringComparison.OrdinalIgnoreCase) ||
                    shell.SessionId != Process.GetCurrentProcess().SessionId)
                    throw new InvalidOperationException("The shell process did not match the official Desktop.");
                Directory.CreateDirectory(statusDirectory);
                var reader = new Thread(() => { Console.ReadLine(); stopping = true; });
                reader.IsBackground = true;
                reader.Start();
                var branded = new Dictionary<IntPtr, WindowBranding>();
                try {
                    while (!stopping && !shell.HasExited) {
                        var gone = new List<IntPtr>();
                        foreach (var pair in branded) if (!IsWindow(pair.Key)) gone.Add(pair.Key);
                        foreach (var window in gone) { branded[window].Dispose(); branded.Remove(window); }
                        EnumWindows((window, data) => {
                            uint pid;
                            GetWindowThreadProcessId(window, out pid);
                            if (pid != shellPid || !IsWindowVisible(window) || GetWindow(window, 4) != IntPtr.Zero || branded.ContainsKey(window)) return true;
                            var name = new StringBuilder(128);
                            GetClassName(window, name, name.Capacity);
                            if (name.ToString() != "Chrome_WidgetWin_1") return true;
                            try {
                                var branding = new WindowBranding(window, executable, icon);
                                branded.Add(window, branding);
                                branding.SaveVerifiedIcon(Path.Combine(statusDirectory, "runtime-window-icon.png"));
                                Console.WriteLine("applied:" + window.ToInt64());
                            } catch (Exception error) { Console.Error.WriteLine(error.Message); }
                            return true;
                        }, IntPtr.Zero);
                        Thread.Sleep(1000);
                        shell.Refresh();
                    }
                } finally { foreach (var branding in branded.Values) branding.Dispose(); }
            }
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }

    private static int SelfTest(string icon)
    {
        var window = new NativeWindow();
        window.CreateHandle(new CreateParams { Caption = "Whale runtime icon regression" });
        var iid = typeof(IPropertyStore).GUID;
        IPropertyStore store;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window.Handle, ref iid, out store));
        var originals = new Dictionary<uint, string>();
        foreach (uint id in PropertyIds) originals[id] = ReadProperty(store, id);
        IntPtr oldBig = Message(window.Handle, GetIcon, 1, IntPtr.Zero);
        IntPtr oldSmall = Message(window.Handle, GetIcon, 0, IntPtr.Zero);
        using (var branding = new WindowBranding(window.Handle, "C:\\fixture\\DeepSeek Harness.exe", icon)) {
            if (ReadProperty(store, 3) != icon + ",0" || ReadProperty(store, 5) != "com.deepseek.dsh")
                throw new InvalidOperationException("Fixture relaunch icon was not set.");
        }
        foreach (uint id in PropertyIds) if (ReadProperty(store, id) != originals[id])
            throw new InvalidOperationException("Fixture original properties were not restored.");
        if (Message(window.Handle, GetIcon, 1, IntPtr.Zero) != oldBig || Message(window.Handle, GetIcon, 0, IntPtr.Zero) != oldSmall)
            throw new InvalidOperationException("Fixture original window icons were not restored.");
        Marshal.ReleaseComObject(store);
        window.DestroyHandle();
        Console.WriteLine("PASS: real window icon + taskbar relaunch properties + restoration");
        return 0;
    }
}
