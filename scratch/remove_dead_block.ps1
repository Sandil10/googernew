$path = 'c:\Users\Administrator\Documents\googernew-main\app\dashboard\page.tsx'
$lines = Get-Content $path
$keep = $lines[0..1841] + $lines[2179..($lines.Length-1)]
Set-Content -Path $path -Value $keep -Encoding UTF8
Write-Host ("Wrote {0} lines" -f $keep.Length)
