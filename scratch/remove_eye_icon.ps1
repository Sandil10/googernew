$l = Get-Content 'f:\googer new\googer-next\app\dashboard\shop\page.tsx'
$new = $l[0..1943] + $l[1954..($l.Count-1)]
$new | Set-Content 'f:\googer new\googer-next\app\dashboard\shop\page.tsx'
