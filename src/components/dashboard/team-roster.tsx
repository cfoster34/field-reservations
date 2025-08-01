'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string
  position: string
  avatar?: string
  status: 'active' | 'inactive' | 'injured'
}

const mockTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Alex Johnson',
    email: 'alex.j@example.com',
    position: 'Forward',
    avatar: '/api/placeholder/40/40',
    status: 'active',
  },
  {
    id: '2',
    name: 'Sarah Chen',
    email: 'sarah.c@example.com',
    position: 'Midfielder',
    avatar: '/api/placeholder/40/40',
    status: 'active',
  },
  {
    id: '3',
    name: 'Mike Williams',
    email: 'mike.w@example.com',
    position: 'Defender',
    avatar: '/api/placeholder/40/40',
    status: 'injured',
  },
  {
    id: '4',
    name: 'Emma Davis',
    email: 'emma.d@example.com',
    position: 'Goalkeeper',
    avatar: '/api/placeholder/40/40',
    status: 'active',
  },
  {
    id: '5',
    name: 'James Lee',
    email: 'james.l@example.com',
    position: 'Forward',
    avatar: '/api/placeholder/40/40',
    status: 'inactive',
  },
]

export function TeamRoster() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Roster</CardTitle>
          <CardDescription>
            Manage your team members
          </CardDescription>
        </div>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Player
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockTeamMembers.map((member) => (
            <div key={member.id} className="flex items-center space-x-4">
              <Avatar>
                <AvatarImage src={member.avatar} alt={member.name} />
                <AvatarFallback>
                  {member.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">
                  {member.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.position}
                </p>
              </div>
              <Badge
                variant={
                  member.status === 'active'
                    ? 'success'
                    : member.status === 'injured'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {member.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}