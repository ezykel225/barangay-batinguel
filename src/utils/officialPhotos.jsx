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

// Renders a photo if one exists for this name, otherwise falls back to
// the given icon -- so officials added later without a photo yet don't
// break the layout. `photoUrl` (from barangay_officials.photo_url,
// set via the dashboard's profile photo upload) takes priority over
// the static bundled photo map above.
export const PersonAvatar = ({ name, photoUrl, fallbackIcon, className }) => {
  const photo = photoUrl || officialPhotos[name]
  return photo ? (
    <img src={photo} alt={name} className={className} />
  ) : (
    fallbackIcon
  )
}
