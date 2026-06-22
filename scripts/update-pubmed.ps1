param(
  [string]$OutputPath = "data/items.json",
  [int]$DaysBack = 7
)

$ErrorActionPreference = "Stop"

$since = (Get-Date).AddDays(-1 * $DaysBack).ToString("yyyy/MM/dd")
$until = (Get-Date).ToString("yyyy/MM/dd")
$term = '(amyotrophic lateral sclerosis[Title/Abstract] OR ALS[Title/Abstract] OR motor neuron disease[Title/Abstract])'
$encodedTerm = [System.Web.HttpUtility]::UrlEncode($term)
$searchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=$encodedTerm&mindate=$since&maxdate=$until&datetype=pdat&retmode=json&retmax=25&sort=pub+date"

$search = Invoke-RestMethod -Uri $searchUrl
$ids = @($search.esearchresult.idlist)

if ($ids.Count -eq 0) {
  Write-Host "No PubMed records found for $since to $until"
  exit 0
}

$summaryUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=$($ids -join ',')&retmode=json"
$summary = Invoke-RestMethod -Uri $summaryUrl

$items = foreach ($id in $ids) {
  $record = $summary.result.$id
  [ordered]@{
    id = "pmid-$id"
    publishedAt = if ($record.pubdate) { $record.pubdate } else { (Get-Date).ToString("yyyy-MM-dd") }
    source = if ($record.fulljournalname) { $record.fulljournalname } else { "PubMed" }
    category = "机制"
    priority = "medium"
    title = $record.title
    titleZh = "[待翻译] $($record.title)"
    summary = "Fetched from PubMed. Add abstract extraction and translation in the next pipeline step."
    summaryZh = "已从 PubMed 抓取。下一步接入摘要提取、中文翻译、分类和重要性评分。"
    insight = "待人工或 AI 复核后生成研究意义。"
    tags = @("ALS", "PubMed")
    url = "https://pubmed.ncbi.nlm.nih.gov/$id/"
    doi = ""
    pmid = $id
    trialId = ""
  }
}

$payload = [ordered]@{
  updatedAt = (Get-Date).ToString("yyyy-MM-dd")
  items = $items
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Wrote $($items.Count) PubMed records to $OutputPath"
