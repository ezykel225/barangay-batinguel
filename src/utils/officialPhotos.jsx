// Official & nurse photos — filenames match `full_name` exactly, so any
// future official added through the dashboard just needs a same-named file
// dropped into src/assets/images to get a photo; otherwise it falls back
// to an icon automatically.
import photoCredo from '../assets/images/Hon. Frankie Credo.jpg'
import photoTan from '../assets/images/Alexis Tan.jpg'
import photoRemata from '../assets/images/Adelina Fabillar Remata.jpg'
import photoAmparado from '../assets/images/Caroline Catan Amparado.jpg'
import photoBardago from '../assets/images/Sheila Mae Flores Bardago.jpg'
import photoBaroy from '../assets/images/Harold Katada Baroy.jpg'
import photoCabrera from '../assets/images/Moronihea Alcancia Cabrera.jpg'
import photoCatalan from '../assets/images/Arnulfo Abol Catalan.jpg'
import photoBarba from '../assets/images/Rey Catadman Barba.jpg'
import photoDuran from '../assets/images/Jeffrey Feria Duran.jpg'
import photoTolentino from '../assets/images/Lei Marie Daiella Montesa Tolentino.jpg'
import photoSantos from '../assets/images/Maria Elena R. Santos, RN.jpg'

export const officialPhotos = {
  'Hon. Frankie Credo': photoCredo,
  'Alexis Tan': photoTan,
  'Adelina Fabillar Remata': photoRemata,
  'Caroline Catan Amparado': photoAmparado,
  'Sheila Mae Flores Bardago': photoBardago,
  'Harold Katada Baroy': photoBaroy,
  'Moronihea Alcancia Cabrera': photoCabrera,
  'Arnulfo Abol Catalan': photoCatalan,
  'Rey Catadman Barba': photoBarba,
  'Jeffrey Feria Duran': photoDuran,
  'Lei Marie Daiella Montesa Tolentino': photoTolentino,
  'Maria Elena R. Santos, RN': photoSantos,
}

// Renders a photo if one exists for this name, otherwise falls back to
// the given icon — so officials added later without a photo yet don't
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
