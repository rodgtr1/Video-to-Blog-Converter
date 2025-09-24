'use client'

import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AlphaSliderProps {
  value: number
  onChange: (value: number) => void
}

export function AlphaSlider({ value, onChange }: AlphaSliderProps) {
  const handleValueChange = (values: number[]) => {
    onChange(values[0])
  }

  const getSliderLabel = (value: number) => {
    if (value < 0.3) return 'Extractive (faithful to transcript)'
    if (value < 0.7) return 'Balanced'
    return 'Creative (blog-style)'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Writing Style</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Faithful</span>
            <span>Creative</span>
          </div>
          <Slider
            value={[value]}
            onValueChange={handleValueChange}
            max={1}
            min={0}
            step={0.1}
            className="w-full"
          />
        </div>
        <div className="text-center">
          <span className="text-sm font-medium">{getSliderLabel(value)}</span>
          <div className="text-xs text-gray-500 mt-1">
            Alpha: {value.toFixed(1)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}