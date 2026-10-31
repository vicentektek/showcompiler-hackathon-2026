using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

internal static class RunqLauncher
{
    private static Process server;
    private static volatile bool stopping;

    private static int Main(string[] args)
    {
        bool smoke = Array.IndexOf(args, "--smoke-test") >= 0;
        bool noBrowser = smoke || Array.IndexOf(args, "--no-browser") >= 0;
        try
        {
            foreach (string arg in args)
                if (arg != "--smoke-test" && arg != "--no-browser")
                    throw new ArgumentException("Unsupported launcher option. Use --smoke-test or --no-browser.");
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string node = Path.Combine(root, "runtime", "node.exe");
            string app = Path.Combine(root, "app");
            string entry = Path.Combine(app, "tools", "windows", "start-package.mjs");
            if (!File.Exists(node) || !File.Exists(entry))
                throw new InvalidOperationException("Extract the complete RUNQ package before starting RUNQ.exe.");

            var ready = new ManualResetEvent(false);
            string url = null;
            server = new Process();
            server.StartInfo = new ProcessStartInfo(node, "\"" + entry + "\"")
            {
                WorkingDirectory = app, UseShellExecute = false,
                RedirectStandardOutput = true, RedirectStandardError = true,
                RedirectStandardInput = true, CreateNoWindow = true
            };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data == null || !e.Data.StartsWith("RUNQ_READY ")) return;
                Uri address;
                string candidate = e.Data.Substring(11).Trim();
                if (Uri.TryCreate(candidate, UriKind.Absolute, out address) &&
                    address.Scheme == "http" && address.Host == "127.0.0.1")
                {
                    url = candidate;
                    ready.Set();
                }
            };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Console.Error.WriteLine("RUNQ server: " + e.Data);
            };
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
            {
                e.Cancel = true; stopping = true;
            };
            if (!server.Start()) throw new InvalidOperationException("Could not start the bundled local server.");
            server.BeginOutputReadLine(); server.BeginErrorReadLine();
            if (!ready.WaitOne(15000)) throw new InvalidOperationException("Local server did not become ready within 15 seconds.");
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 3000;
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                if (response.StatusCode != HttpStatusCode.OK)
                    throw new InvalidOperationException("Local application readiness check failed.");
            }
            Console.WriteLine("RUNQ_READY " + url);
            Console.WriteLine("RUNQ_SERVER_PID " + server.Id);
            if (smoke)
            {
                Console.WriteLine("RUNQ_WINDOWS_SMOKE_OK");
                return 0;
            }
            if (!noBrowser) Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            Console.WriteLine("Browser audio prototype. Press STOP ALL in RUNQ before closing the browser.");
            Console.WriteLine("Type exit or press Ctrl+C to stop this local HTTP server.");
            Task<string> input = Task.Run(() => Console.ReadLine());
            while (!server.HasExited && !stopping)
            {
                if (input.Wait(100))
                {
                    string line = input.Result;
                    if (line == null || line.Trim().Equals("exit", StringComparison.OrdinalIgnoreCase)) break;
                    input = Task.Run(() => Console.ReadLine());
                }
            }
            return server.HasExited ? server.ExitCode : 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("RUNQ could not start: " + error.Message);
            return 1;
        }
        finally
        {
            if (server != null)
            {
                try
                {
                    if (!server.HasExited)
                    {
                        server.StandardInput.WriteLine("exit");
                        if (!server.WaitForExit(5000))
                        {
                            Console.Error.WriteLine("RUNQ server exit timed out; terminating this package's server.");
                            server.Kill(); server.WaitForExit(5000);
                        }
                    }
                }
                catch (InvalidOperationException)
                {
                    Console.Error.WriteLine("RUNQ server had already exited during shutdown.");
                }
                server.Dispose();
            }
        }
    }
}
