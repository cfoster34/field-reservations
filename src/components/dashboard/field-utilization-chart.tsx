'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

const data = [
  {
    name: 'Soccer Field A',
    morning: 65,
    afternoon: 85,
    evening: 95,
  },
  {
    name: 'Soccer Field B',
    morning: 55,
    afternoon: 75,
    evening: 85,
  },
  {
    name: 'Baseball Diamond',
    morning: 45,
    afternoon: 65,
    evening: 75,
  },
  {
    name: 'Tennis Court 1',
    morning: 70,
    afternoon: 80,
    evening: 60,
  },
  {
    name: 'Basketball Court',
    morning: 40,
    afternoon: 70,
    evening: 90,
  },
]

export function FieldUtilizationChart() {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Field Utilization</CardTitle>
        <CardDescription>
          Usage percentage by time of day
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                className="text-xs"
                tickLine={false}
                axisLine={false}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                className="text-xs"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Bar
                dataKey="morning"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                opacity={0.6}
              />
              <Bar
                dataKey="afternoon"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                opacity={0.8}
              />
              <Bar
                dataKey="evening"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}