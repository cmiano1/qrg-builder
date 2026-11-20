param(
    [Parameter(Mandatory=$true)][string]$In,
    [Parameter(Mandatory=$true)][string]$Out,
    [switch]$UpdateFields,
    [switch]$UpdateTOC
)

$ErrorActionPreference = 'Stop'

function Release-ComObject([object]$obj) {
    if ($null -ne $obj) {
        try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) } catch {}
    }
}

$inPath = [System.IO.Path]::GetFullPath($In)
$outPath = [System.IO.Path]::GetFullPath($Out)

if (-not (Test-Path -LiteralPath $inPath)) {
    Write-Error "Input DOCX not found: $inPath"
    exit 2
}

$outDir = [System.IO.Path]::GetDirectoryName($outPath)
if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    # ReadOnly=$true so rendering cannot silently modify the source DOCX.
    $doc = $word.Documents.Open($inPath, $false, $true)

    if ($UpdateFields) {
        foreach ($story in $doc.StoryRanges) {
            try { $story.Fields.Update() | Out-Null } catch {}
        }
    }

    if ($UpdateTOC) {
        foreach ($toc in $doc.TablesOfContents) {
            try { $toc.Update() } catch {}
        }
    }

    # wdExportFormatPDF = 17
    # Called late-bound with exactly two plain arguments (the way VBScript calls it). Since Office update
    # 16.0.20527.20194, the direct form $doc.ExportAsFixedFormat($outPath, 17) through PowerShell's COM adapter
    # hangs Word, even on a blank document, while this form exports in seconds.
    $exportArgs = [object[]]@([string]$outPath, [int]17)
    [void][System.__ComObject].InvokeMember('ExportAsFixedFormat', [System.Reflection.BindingFlags]::InvokeMethod, $null, $doc, $exportArgs)

    $doc.Close([ref]$false)
    Release-ComObject $doc
    $doc = $null

    $word.Quit()
    Release-ComObject $word
    $word = $null

    if (-not (Test-Path -LiteralPath $outPath)) {
        throw "Word returned without creating the PDF: $outPath"
    }

    $size = (Get-Item -LiteralPath $outPath).Length
    if ($size -le 0) {
        throw "Word created an empty PDF: $outPath"
    }

    Write-Output ("OK -> " + $outPath)
    exit 0
}
catch {
    Write-Error ("Word render failed: " + $_.Exception.Message)
    exit 1
}
finally {
    if ($null -ne $doc) {
        try { $doc.Close([ref]$false) } catch {}
        Release-ComObject $doc
    }
    if ($null -ne $word) {
        try { $word.Quit() } catch {}
        Release-ComObject $word
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
