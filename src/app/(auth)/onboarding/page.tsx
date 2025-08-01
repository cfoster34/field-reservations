'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Sport, NotificationPreferences } from '@/types/user'
import { BiLoaderAlt } from 'react-icons/bi'
import { MdSportsSoccer, MdNotifications, MdPerson, MdCheck } from 'react-icons/md'

interface OnboardingStep {
  id: number
  title: string
  description: string
  icon: React.ElementType
}

const steps: OnboardingStep[] = [
  {
    id: 1,
    title: 'Personal Information',
    description: 'Tell us a bit about yourself',
    icon: MdPerson,
  },
  {
    id: 2,
    title: 'Sports Preferences',
    description: 'What sports are you interested in?',
    icon: MdSportsSoccer,
  },
  {
    id: 3,
    title: 'Notifications',
    description: 'How would you like to stay updated?',
    icon: MdNotifications,
  },
]

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
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
  
  const { user, updateProfile } = useAuth()
  const router = useRouter()
  const { showToast } = useToast()

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      await updateProfile({
        ...formData,
        onboarding_completed: true,
      })
      showToast('Success', 'Profile setup complete!', 'success')
      router.push('/dashboard')
    } catch (error: any) {
      showToast('Error', error.message || 'Failed to complete setup', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bio" className="text-gray-700">
                About You (Optional)
              </Label>
              <textarea
                id="bio"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Tell us about your sports interests..."
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="teamName" className="text-gray-700">
                Team/Organization Name (Optional)
              </Label>
              <Input
                id="teamName"
                type="text"
                placeholder="e.g., Lightning Youth Soccer"
                value={formData.teamName}
                onChange={(e) => setFormData(prev => ({ ...prev, teamName: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        )
      
      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="sport" className="text-gray-700">
                Primary Sport Interest
              </Label>
              <Select
                id="sport"
                value={formData.preferredSport}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  preferredSport: e.target.value as Sport 
                }))}
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
            
            <p className="text-sm text-gray-600">
              This helps us show you relevant fields and reservations first.
            </p>
          </div>
        )
      
      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded"
                  checked={formData.notifications.email}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notifications: { ...prev.notifications, email: e.target.checked }
                  }))}
                />
                <span className="text-gray-700">Email notifications</span>
              </label>
              
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded"
                  checked={formData.notifications.push}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notifications: { ...prev.notifications, push: e.target.checked }
                  }))}
                />
                <span className="text-gray-700">Push notifications</span>
              </label>
              
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded"
                  checked={formData.notifications.sms}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notifications: { ...prev.notifications, sms: e.target.checked }
                  }))}
                />
                <span className="text-gray-700">SMS notifications</span>
              </label>
            </div>
            
            <div>
              <Label htmlFor="reminder" className="text-gray-700">
                Reservation reminders
              </Label>
              <Select
                id="reminder"
                value={formData.notifications.reminderHours}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  notifications: { 
                    ...prev.notifications, 
                    reminderHours: parseInt(e.target.value) 
                  }
                }))}
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
        )
      
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <Card className="p-8 shadow-xl bg-white/95 backdrop-blur">
          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`
                      flex items-center justify-center w-10 h-10 rounded-full
                      ${currentStep >= step.id 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-400'}
                    `}
                  >
                    {currentStep > step.id ? (
                      <MdCheck className="w-5 h-5" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`
                        w-24 h-1 mx-2
                        ${currentStep > step.id ? 'bg-blue-600' : 'bg-gray-200'}
                      `}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              {steps[currentStep - 1] && (
                <>
                  {React.createElement(steps[currentStep - 1].icon, {
                    className: "w-8 h-8 text-blue-600 mr-3"
                  })}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {steps[currentStep - 1].title}
                    </h2>
                    <p className="text-gray-600">
                      {steps[currentStep - 1].description}
                    </p>
                  </div>
                </>
              )}
            </div>
            
            {renderStepContent()}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1 || isLoading}
            >
              Previous
            </Button>
            
            {currentStep < steps.length ? (
              <Button onClick={handleNext} disabled={isLoading}>
                Next
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <BiLoaderAlt className="animate-spin mr-2" />
                    Completing...
                  </>
                ) : (
                  'Complete Setup'
                )}
              </Button>
            )}
          </div>

          {/* Skip option */}
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-500 hover:text-gray-700"
              disabled={isLoading}
            >
              Skip for now
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}