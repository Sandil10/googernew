$path = 'c:\Users\Administrator\Documents\googernew-main\app\dashboard\shop\page.tsx'
$lines = Get-Content $path

# Find "{sponsoredPreviewModal &&" block start (should be ~line 4934, 0-indexed 4933)
$previewStart = -1
$previewEnd = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\{sponsoredPreviewModal && \($') {
        $previewStart = $i
        break
    }
}
if ($previewStart -ge 0) {
    $depth = 0
    for ($i = $previewStart; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        foreach ($ch in $line.ToCharArray()) {
            if ($ch -eq '{') { $depth++ }
            elseif ($ch -eq '}') { $depth-- }
        }
        if ($depth -eq 0 -and $i -gt $previewStart) {
            $previewEnd = $i
            break
        }
    }
}
Write-Host ("Preview modal: lines {0}-{1}" -f ($previewStart+1), ($previewEnd+1))

# Find "{sponsoredImageModal && (" block
$imageStart = -1
$imageEnd = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\{sponsoredImageModal && \($') {
        $imageStart = $i
        break
    }
}
if ($imageStart -ge 0) {
    $depth = 0
    for ($i = $imageStart; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        foreach ($ch in $line.ToCharArray()) {
            if ($ch -eq '{') { $depth++ }
            elseif ($ch -eq '}') { $depth-- }
        }
        if ($depth -eq 0 -and $i -gt $imageStart) {
            $imageEnd = $i
            break
        }
    }
}
Write-Host ("Image modal: lines {0}-{1}" -f ($imageStart+1), ($imageEnd+1))

# Build replacement blocks
$previewReplacement = @"
      {sponsoredPreviewModal && (
        <AdSecondViewModal
          ad={sponsoredPreviewModal.product}
          kind={(sponsoredPreviewModal.videoUrl ? "video" : "embed") as AdSecondViewKind}
          onClose={() => setSponsoredPreviewModal(null)}
          onToggleLike={(id) => handleToggleLike(Number(id))}
          onOpenSheet={openBottomSheet}
          onShare={(a) => handleShareClick(a, "share")}
          onReport={(a) => setReportingProduct(a)}
          onNotInterested={(id) => handleNotInterested(Number(id))}
          onCollectCoin={(e, a) => handleAdCoinClick(e, a)}
          onNavigateToProfile={(e, a) => navigateToProfile(e, a.user_id)}
          canShowCollectCoin={canShowCollectCoinButton}
        />
      )}
"@

$imageReplacement = @"
      {sponsoredImageModal && (
        <AdSecondViewModal
          ad={sponsoredImageModal.product}
          kind="image"
          images={sponsoredImageModal.images}
          onClose={() => { setSponsoredImageModal(null); setIsSponsoredImageMenuOpen(false); }}
          onToggleLike={(id) => handleToggleLike(Number(id))}
          onOpenSheet={openBottomSheet}
          onShare={(a) => handleShareClick(a, "share")}
          onReport={(a) => setReportingProduct(a)}
          onNotInterested={(id) => handleNotInterested(Number(id))}
          onCollectCoin={(e, a) => handleAdCoinClick(e, a)}
          onNavigateToProfile={(e, a) => navigateToProfile(e, a.user_id)}
          canShowCollectCoin={canShowCollectCoinButton}
        />
      )}
"@

if ($previewStart -lt 0 -or $previewEnd -lt 0 -or $imageStart -lt 0 -or $imageEnd -lt 0) {
    Write-Host "Could not locate all blocks; aborting"
    exit 1
}
# Process image block first (higher line number) so indices stay valid for preview
$new = @()
$new += $lines[0..($previewStart-1)]
$new += $previewReplacement -split "`r?`n"
$new += $lines[($previewEnd+1)..($imageStart-1)]
$new += $imageReplacement -split "`r?`n"
$new += $lines[($imageEnd+1)..($lines.Length-1)]

Set-Content -Path $path -Value $new -Encoding UTF8
Write-Host ("Wrote {0} lines" -f $new.Length)
