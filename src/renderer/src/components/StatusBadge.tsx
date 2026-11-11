import { Badge, Box } from '@mantine/core'
import type { PrinterState } from '@shared/types'
import { stateColor, stateLabel } from '../lib/format'

interface Props {
  state?: PrinterState
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export function StatusBadge({ state, size = 'sm' }: Props): React.ReactElement {
  const color = stateColor(state)
  return (
    <Badge
      color={color}
      variant="light"
      size={size}
      leftSection={
        <Box
          className={state === 'error' ? 'status-dot-error' : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: `var(--mantine-color-${color}-6)`
          }}
        />
      }
    >
      {stateLabel(state)}
    </Badge>
  )
}
