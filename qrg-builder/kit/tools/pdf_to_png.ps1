param(
    [Parameter(Mandatory=$true)][string]$In,
    [Parameter(Mandatory=$true)][string]$OutDir,
    [int]$Scale = 150   # rough DPI: multiplies page size / 96
)

# Rasterize a PDF to per-page PNGs using the built-in Windows.Data.Pdf WinRT
# renderer. No external install (no poppler/ghostscript/ImageMagick) required.
# Intended for visual QA of generated documents on this machine.

$ErrorActionPreference = 'Stop'

$inPath = [System.IO.Path]::GetFullPath($In)
if (-not (Test-Path -LiteralPath $inPath)) { Write-Error "PDF not found: $inPath"; exit 2 }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Helper: await a WinRT IAsyncOperation<T> synchronously from PowerShell 5.1.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

# AsTask overload for IAsyncAction (no result, e.g. RenderToStreamAsync).
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
})[0]

function Await($op, $resultType) {
    $m = $asTaskGeneric.MakeGenericMethod($resultType)
    $task = $m.Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    return $task.Result
}

function AwaitAction($op) {
    $task = $asTaskAction.Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
}

# Load the needed WinRT types.
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($inPath)) ([Windows.Storage.StorageFile])
$pdf  = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

$base = [System.IO.Path]::GetFileNameWithoutExtension($inPath)
Write-Output ("PAGES=" + $pdf.PageCount)

for ($i = 0; $i -lt $pdf.PageCount; $i++) {
    $page = $pdf.GetPage([uint32]$i)
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $opts.DestinationWidth = [uint32]($page.Size.Width * ($Scale / 96.0))
    AwaitAction ($page.RenderToStreamAsync($stream, $opts))

    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $size = [uint32]$stream.Size
    Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)

    $n = "{0:D2}" -f ($i + 1)
    $outFile = Join-Path $OutDir ("$base" + "_p$n.png")
    [System.IO.File]::WriteAllBytes($outFile, $bytes)
    Write-Output ("WROTE " + $outFile)
    $page.Dispose()
}
Write-Output "DONE"
exit 0
