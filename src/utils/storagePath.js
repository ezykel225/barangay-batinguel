// `profiles.photo_url` and `barangay_officials.photo_url` store a full
// public URL rather than a storage path, so removing the file a new
// upload replaces means recovering the path from that URL.
//
// Public URLs look like:
//   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
//
// Returns null for anything that doesn't match, so a legacy value, a
// hand-edited row or an empty column can never be turned into a delete
// aimed at the wrong object. Callers should skip the removal on null
// rather than guessing.
export const pathFromPublicUrl = (publicUrl, bucket) => {
  if (!publicUrl || !bucket) return null

  const marker = `/storage/v1/object/public/${bucket}/`
  const at = publicUrl.indexOf(marker)
  if (at === -1) return null

  const path = publicUrl.slice(at + marker.length).split('?')[0]
  if (!path) return null

  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}
