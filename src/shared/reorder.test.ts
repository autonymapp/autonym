import { describe, expect, it } from 'vitest'
import { reorder } from './reorder'

describe('reorder', () => {
  const beats = ['Meet at the tavern', 'Find the map', 'Cross the river', 'Confront the antagonist', 'Return home']

  it('moves an item forward', () => {
    expect(reorder(beats, 1, 3)).toEqual([
      'Meet at the tavern',
      'Cross the river',
      'Confront the antagonist',
      'Find the map',
      'Return home'
    ])
  })

  it('moves the last item to the front', () => {
    expect(reorder(beats, 4, 0)).toEqual([
      'Return home',
      'Meet at the tavern',
      'Find the map',
      'Cross the river',
      'Confront the antagonist'
    ])
  })

  it('swaps adjacent items', () => {
    expect(reorder(beats, 0, 1)).toEqual([
      'Find the map',
      'Meet at the tavern',
      'Cross the river',
      'Confront the antagonist',
      'Return home'
    ])
  })

  it('is a no-op when dropped on itself', () => {
    expect(reorder(beats, 2, 2)).toEqual(beats)
  })

  it('does not mutate the original array', () => {
    const original = [...beats]
    reorder(beats, 0, 3)
    expect(beats).toEqual(original)
  })
})
