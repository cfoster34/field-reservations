'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Sport, NotificationPreferences } from '@/types/user'
import { BiLoaderAlt } from 'react-icons/bi'
import { MdEdit, MdSave, MdCancel, MdCameraAlt } from 'react-icons/md'
import ProtectedRoute from '@/components/auth/protected-route'

export default function ProfilePage() {
  const { user, updateProfile, updatePassword } = useAuth()
  const { showToast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [profileData, setProfileData] = useState({
    name: '',
    phoneNumber: '',
    bio: '',
    teamName: '',
    preferredSport: Sport.SOCCER,
    notifications: {
      email: true,
      push: true,
      sms: false,
      reminderHours: 24,
    } as NotificationPreferences,
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (user?.user_metadata) {
      setProfileData({
        name: user.user_metadata.name || '',
        phoneNumber: user.user_metadata.phoneNumber || '',
        bio: user.user_metadata.bio || '',
        teamName: user.user_metadata.teamName || '',
        preferredSport: user.user_metadata.preferredSport || Sport.SOCCER,
        notifications: user.user_metadata.notifications || {
          email: true,
          push: true,
          sms: false,
          reminderHours: 24,
        },
      })
    }
  }, [user])

  const handleProfileUpdate = async () => {
    setIsLoading(true)
    try {
      await updateProfile(profileData)
      showToast('Success', 'Profile updated successfully!', 'success')
      setIsEditing(false)
    } catch (error: any) {
      showToast('Error', error.message || 'Failed to update profile', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('Error', 'Passwords do not match', 'error')
      return
    }

    if (passwordData.newPassword.length < 6) {
      showToast('Error', 'Password must be at least 6 characters', 'error')
      return
    }

    setIsLoading(true)
    try {
      await updatePassword(passwordData.newPassword)
      showToast('Success', 'Password changed successfully!', 'success')
      setIsChangingPassword(false)
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error: any) {
      showToast('Error', error.message || 'Failed to change password', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">My Profile</h1>

        {/* Profile Information */}
        <Card className="p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Profile Information</h2>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <MdEdit className="mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false)
                    // Reset to original values
                    if (user?.user_metadata) {
                      setProfileData({
                        name: user.user_metadata.name || '',
                        phoneNumber: user.user_metadata.phoneNumber || '',
                        bio: user.user_metadata.bio || '',
                        teamName: user.user_metadata.teamName || '',
                        preferredSport: user.user_metadata.preferredSport || Sport.SOCCER,
                        notifications: user.user_metadata.notifications || {
                          email: true,
                          push: true,
                          sms: false,
                          reminderHours: 24,
                        },
                      })
                    }
                  }}
                  disabled={isLoading}
                >
                  <MdCancel className="mr-2" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleProfileUpdate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <BiLoaderAlt className="animate-spin mr-2" />
                  ) : (
                    <MdSave className="mr-2" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="email" className="text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="mt-1 bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="name" className="text-gray-700">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                value={profileData.name}
                onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!isEditing}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="phoneNumber" className="text-gray-700">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={profileData.phoneNumber}
                onChange={(e) => setProfileData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                disabled={!isEditing}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="teamName" className="text-gray-700">
                Team/Organization
              </Label>
              <Input
                id="teamName"
                type="text"
                value={profileData.teamName}
                onChange={(e) => setProfileData(prev => ({ ...prev, teamName: e.target.value }))}
                disabled={!isEditing}
                className="mt-1"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="bio" className="text-gray-700">
                About Me
              </Label>
              <textarea
                id="bio"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                rows={3}
                value={profileData.bio}
                onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Label htmlFor="sport" className="text-gray-700">
                Preferred Sport
              </Label>
              <Select
                id="sport"
                value={profileData.preferredSport}
                onChange={(e) => setProfileData(prev => ({ 
                  ...prev, 
                  preferredSport: e.target.value as Sport 
                }))}
                disabled={!isEditing}
                className="mt-1"
              >
                <option value={Sport.SOCCER}>Soccer</option>
                <option value={Sport.BASEBALL}>Baseball</option>
                <option value={Sport.FOOTBALL}>Football</option>
                <option value={Sport.BASKETBALL}>Basketball</option>
                <option value={Sport.TENNIS}>Tennis</option>
                <option value={Sport.VOLLEYBALL}>Volleyball</option>
                <option value={Sport.OTHER}>Other</option>
              </Select>
            </div>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-6">Notification Preferences</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-gray-700">Email notifications</span>
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded"
                checked={profileData.notifications.email}
                onChange={(e) => setProfileData(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, email: e.target.checked }
                }))}
                disabled={!isEditing}
              />
            </label>
            
            <label className="flex items-center justify-between">
              <span className="text-gray-700">Push notifications</span>
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded"
                checked={profileData.notifications.push}
                onChange={(e) => setProfileData(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, push: e.target.checked }
                }))}
                disabled={!isEditing}
              />
            </label>
            
            <label className="flex items-center justify-between">
              <span className="text-gray-700">SMS notifications</span>
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded"
                checked={profileData.notifications.sms}
                onChange={(e) => setProfileData(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, sms: e.target.checked }
                }))}
                disabled={!isEditing}
              />
            </label>

            <div>
              <Label htmlFor="reminder" className="text-gray-700">
                Reservation reminders
              </Label>
              <Select
                id="reminder"
                value={profileData.notifications.reminderHours}
                onChange={(e) => setProfileData(prev => ({
                  ...prev,
                  notifications: { 
                    ...prev.notifications, 
                    reminderHours: parseInt(e.target.value) 
                  }
                }))}
                disabled={!isEditing}
                className="mt-1"
              >
                <option value={0}>No reminders</option>
                <option value={1}>1 hour before</option>
                <option value={6}>6 hours before</option>
                <option value={24}>24 hours before</option>
                <option value={48}>48 hours before</option>
              </Select>
            </div>
          </div>
        </Card>

        {/* Password Change */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Security</h2>
            {!isChangingPassword && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChangingPassword(true)}
              >
                Change Password
              </Button>
            )}
          </div>

          {isChangingPassword && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="newPassword" className="text-gray-700">
                  New Password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ 
                    ...prev, 
                    newPassword: e.target.value 
                  }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-gray-700">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ 
                    ...prev, 
                    confirmPassword: e.target.value 
                  }))}
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsChangingPassword(false)
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    })
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePasswordChange}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <BiLoaderAlt className="animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600">
              Account created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </p>
            <p className="text-sm text-gray-600">
              Last sign in: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </Card>
      </div>
    </ProtectedRoute>
  )
}