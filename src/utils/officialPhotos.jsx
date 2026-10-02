// Photos for the officials directory.
//
// The keys below must match `barangay_officials.full_name` EXACTLY --
// that string is the only link between a row and its picture. Two
// officials previously had no photo for precisely this reason: the map
// said 'Alexis Tan' while the directory said 'Alexis Theress P. Tan',
// and Mondoñedo had no entry at all. Both failed silently, falling
// back to an icon with nothing logged anywhere.
//
// Filenames are deliberately short and ASCII ('N.Mondonedo.jpg', not
// 'Nicholas Khyle R. Mondoñedo.jpg'). The map carries the exact name,
// so the file does not have to, and a filename without ñ or spaces is
// one less thing to be mangled by an upload, a zip, or a filesystem
// that normalises unicode differently.
//
// To add an official: drop the photo in src/assets/images, import it,
// and add a line keyed on their exact directory name. A missing entry
// is not an error -- PersonAvatar falls back to an icon -- so check
// the page after adding one.
import photoCatalan from '../assets/images/A.Catalan.jpg'
import photoRemata from '../assets/images/A.Remata.jpg'
import photoTan from '../assets/images/A.Tan.jpg'
import photoAmparado from '../assets/images/C.Amparado.jpg'
import photoCredo from '../assets/images/F.Credo.jpg'
import photoBaroy from '../assets/images/H.Baroy.jpg'
import photoDuran from '../assets/images/J.Duran.jpg'
import photoCabrera from '../assets/images/M.Cabrera.jpg'
import photoMondonedo from '../assets/images/N.Mondonedo.jpg'
import photoBarba from '../assets/images/R.Barba.jpg'
import photoBardago from '../assets/images/S.Bardago.jpg'

export const officialPhotos = {
  'Hon. Frankie Credo': photoCredo,
  'Alexis Theress P. Tan': photoTan,
  'Adelina Fabillar Remata': photoRemata,
  'Caroline Catan Amparado': photoAmparado,
  'Sheila Mae Flores Bardago': photoBardago,
  'Harold Katada Baroy': photoBaroy,
  'Moronihea Alcancia Cabrera': photoCabrera,
  'Arnulfo Abol Catalan': photoCatalan,
  'Rey Catadman Barba': photoBarba,
  'Jeffrey Feria Duran': photoDuran,
  'Nicholas Khyle R. Mondoñedo': photoMondonedo,
  // The health centre nurse has no photo here on purpose. The file
  // that used to sit here was not a picture of her, and a stranger's
  // face presented as barangay staff is worse than no face at all.
  // PersonAvatar renders an icon instead, which claims nothing.
}

// ─── ⚠️ RENAMING AN OFFICIAL UNLINKS THEIR PORTRAIT ───────────────────
//
// This map is keyed on the exact `barangay_officials.full_name`, and
// CLAUDE.md records that as a known fragility. It has now cost the
// project a portrait once, and the audit trail says exactly how:
//
//   2026-10-01 04:58  edited    Jeffrey Cataylo Lastimoso -- Kagawad
//   2026-10-01 05:02  archived  (reason: "for testing purposes")
//   2026-10-01 05:04  restored
//   2026-10-01 05:10  archived  (reason: "gi kapoy na")
//   2026-10-01 13:29  restored
//
// The portrait was lost at **04:58, by the EDIT**, four minutes before
// the first archive. `display_order` 10 held the Kagawad's real name,
// the edit replaced it, no key matched any more, and `PersonAvatar`
// fell back to an icon without a word anywhere. The two archive/restore
// cycles that followed were a red herring: neither handler reads,
// writes, clears or deletes anything to do with a photo, `photo_url` is
// NULL on every row in the directory, and no storage call happens on
// either path -- all three verified against the live database.
//
// ─── ✅ THE DATA WAS CORRECTED, 2026-10-02 (migration 027) ────────────
//
// The barangay confirmed that **Jeffrey F. Duran is the real Kagawad**
// and that the "Lastimoso" entry was an erroneous rename, not a second
// official. `barangay_officials` row `311c140b-…` -- the SAME row, kept
// -- had its `full_name` restored to `Jeffrey Feria Duran`, and nothing
// else about it changed.
//
// ⚠️ `J.Duran.jpg` was NEVER re-keyed, and that is why this was a
// one-line data fix rather than a reconstruction. The map had carried
// the exact name since the repository's earliest commit -- the original
// uploaded file was literally called "Jeffrey Feria Duran.jpg" -- so
// the portrait resolved again the moment the directory row was right.
// It is the same lesson as the missing Kagawad of 2026-09-30: the photo
// map was already correct and waiting for a row to attach to.
//
// ⚠️ The canonical form is "Jeffrey Feria Duran", with the middle name
// SPELLED OUT, not "Jeffrey F. Duran". Four sources agree -- his
// profile, this map, the original asset filename, and the directory's
// own convention, where every official spells the middle name in full
// (Catan, Flores, Katada, Abol, Catadman, Fabillar). Do not "tidy" it
// to an initial; `officialPhotos.test.js` fails if anybody does.
//
// The helpers below exist so the next rename cannot be silent.

// Whether this exact directory name has a bundled portrait.
export const hasBundledPhoto = (name) =>
  Boolean(name && Object.prototype.hasOwnProperty.call(officialPhotos, name))

// What will actually be rendered for a row, or null when nothing will.
// `photo_url` (from `barangay_officials.photo_url`, set by the
// dashboard's own upload) wins over the bundled map, because it is the
// one a person chose deliberately.
export const photoFor = (name, photoUrl) =>
  photoUrl || officialPhotos[name] || null

// ⚠️ The warning this whole section exists for. True when renaming a
// row would take away the only portrait it has: the OLD name had a
// bundled photo, the NEW name has none, and there is no uploaded
// `photo_url` to fall back on.
//
// It is a WARNING, never a refusal. Correcting a misspelled name is a
// legitimate edit and must not be blocked by a picture -- the right
// outcome is that the official doing it finds out, and either adds a
// key for the new name or tells whoever maintains the photos.
export const portraitWillBeLost = (oldName, newName, photoUrl) => {
  if (photoUrl) return false
  const from = String(oldName ?? '').trim()
  const to = String(newName ?? '').trim()
  if (!from || !to || from === to) return false
  return hasBundledPhoto(from) && !hasBundledPhoto(to)
}

// Renders a photo if one exists for this name, otherwise falls back to
// the given icon -- so officials added later without a photo yet don't
// break the layout.
//
// ⚠️ The fallback is NAMED. It used to render a bare icon with no text
// anywhere, which is indistinguishable from an official who simply has
// no picture yet -- and that is precisely why a lost portrait sat on
// the public page unnoticed. `title` and an accessible name say which
// of the two it is.
export const PersonAvatar = ({ name, photoUrl, fallbackIcon, className }) => {
  const photo = photoFor(name, photoUrl)
  if (photo) {
    return <img src={photo} alt={name} className={className} />
  }
  // ⚠️ The caller's className is deliberately NOT passed on here. Those
  // classes (`official-row-photo`, `council-card-photo`, ...) are sized
  // `<img>` rules with `object-fit: cover`; on a `<span>` the width and
  // height would not even apply, and the fallback has never carried
  // them -- before this change it was the bare icon with no wrapper at
  // all. So the wrapper is its own class and the icon renders exactly
  // as it did; the only thing that is new is that it now says what it
  // is.
  const label = name ? `No photo on file for ${name}` : 'No photo on file'
  return (
    <span className="person-avatar-fallback" role="img" aria-label={label} title={label}>
      {fallbackIcon}
    </span>
  )
}
