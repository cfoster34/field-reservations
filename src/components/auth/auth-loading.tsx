import { BiLoaderAlt } from 'react-icons/bi'

export default function AuthLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
      <div className="text-center">
        <BiLoaderAlt className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">Loading...</h2>
        <p className="text-gray-500 mt-2">Please wait while we authenticate you</p>
      </div>
    </div>
  )
}