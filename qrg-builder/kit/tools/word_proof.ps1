param(
    [Parameter(Mandatory=$true)][string]$List,
    [Parameter(Mandatory=$true)][string]$Out
)
# Word's own spelling and grammar check on built QRGs (read-only, invisible). Added after the project owner asked
# whether grammar was checked during the build (the QA had no grammar or spelling layer).
# -List: a text file with one absolute .docx path per line. -Out: a JSON file with every flag Word raises:
#   [{ file, kind: "spelling" | "grammar", text, sentence }]
# Read-only: each file opens ReadOnly and closes without saving. Word quits and COM objects are released at the end.
# Note: COM GrammaticalErrors uses Word's built-in grammar checker, not the cloud Editor, so it is a floor, not a full edit.
$ErrorActionPreference = 'Stop'
function Release-ComObject([object]$obj) { if ($null -ne $obj) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) } catch {} } }
$files = Get-Content -LiteralPath ([System.IO.Path]::GetFullPath($List)) | Where-Object { $_.Trim() -ne '' }
$rows = New-Object System.Collections.ArrayList
$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.Options.CheckSpellingAsYouType = $true
    $word.Options.CheckGrammarAsYouType = $true
    $word.Options.CheckGrammarWithSpelling = $true
    foreach ($f in $files) {
        $p = [System.IO.Path]::GetFullPath($f.Trim())
        $doc = $null
        try {
            $doc = $word.Documents.Open($p, $false, $true)
            $doc.SpellingChecked = $false
            $doc.GrammarChecked = $false
            foreach ($e in $doc.SpellingErrors) {
                $s = ''; try { $s = $e.Sentences.Item(1).Text } catch {}
                [void]$rows.Add([pscustomobject]@{ file = [System.IO.Path]::GetFileName($p); kind = 'spelling'; text = $e.Text; sentence = $s })
                Release-ComObject $e
            }
            foreach ($e in $doc.GrammaticalErrors) {
                [void]$rows.Add([pscustomobject]@{ file = [System.IO.Path]::GetFileName($p); kind = 'grammar'; text = $e.Text; sentence = $e.Text })
                Release-ComObject $e
            }
            Write-Output ("checked " + [System.IO.Path]::GetFileName($p))
        } catch {
            [void]$rows.Add([pscustomobject]@{ file = [System.IO.Path]::GetFileName($p); kind = 'error'; text = $_.Exception.Message; sentence = '' })
        } finally {
            if ($null -ne $doc) { try { $doc.Close([ref]$false) } catch {}; Release-ComObject $doc }
        }
    }
} finally {
    if ($null -ne $word) { try { $word.Quit() } catch {}; Release-ComObject $word }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
$json = ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 3
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Out), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("flags " + $rows.Count)
