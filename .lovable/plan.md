

# Document Preview in TPV Extractor

## What
Add a "Zobrazit dokument" button in the bottom-left of the TPVExtractor dialog (in the "done" phase) that opens the source CN document in `DocumentPreviewModal`. This lets users cross-reference extracted data against the original file before saving.

## How

### File: `src/components/assistant/TPVExtractor.tsx`

1. **Track source document metadata** — store `fileItemId` when extraction succeeds (from SharePoint path) or the manual file's blob URL (for uploaded files):
   - Add state: `sourceDoc: { itemId?: string; fileName: string; blobUrl?: string } | null`
   - In `extractFromSharePoint`: save `{ itemId: fileItemId, fileName }`
   - In `handleManualExtract`: create a blob URL from `manualFile` and save `{ fileName, blobUrl: URL.createObjectURL(manualFile) }`

2. **Add preview state** — `previewOpen`, `previewLoading`, `previewUrl`, `webUrl`, `downloadUrl`

3. **Import and use `useSharePointDocs`** to call `getPreview(itemId)` for SharePoint files. For manual uploads, use the blob URL directly (PDF renders in iframe, Excel shows a "download" fallback).

4. **Add preview button** in the `DialogFooter` (left side, before Zrušit):
   ```
   <Button variant="ghost" size="sm" onClick={openSourcePreview}>
     <Eye className="h-4 w-4 mr-1" /> Zobrazit dokument
   </Button>
   ```

5. **Render `DocumentPreviewModal`** at the bottom of the component, using the tracked preview URLs.

### File: `src/components/DocumentPreviewModal.tsx`
No changes needed — it already supports all required props.

### Logic flow
- User clicks "Zobrazit dokument" → if SharePoint file, call `getPreview(itemId)` to get `previewUrl` → open `DocumentPreviewModal`
- If manual upload (PDF), use blob URL directly as `previewUrl`
- If manual upload (XLSX), show download-only fallback (no iframe preview for Excel blobs)
- Modal opens as a portal overlay on top of the dialog — user reviews, closes, continues editing/saving

