import { FaMapMarkerAlt } from 'react-icons/fa'

export default function TanodArea({ children }) {
  return <span className="td-area-row"><FaMapMarkerAlt aria-hidden="true" /><span>{children}</span></span>
}
