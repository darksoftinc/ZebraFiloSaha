import { createTheme } from '@mantine/core'

const fontFamily =
  'Inter, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const monoFamily = '"Cascadia Code", "Consolas", "SFMono-Regular", monospace'

export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily,
  headings: {
    fontFamily,
    fontWeight: '650'
  },
  fontSizes: {
    xs: '11px',
    sm: '12.5px',
    md: '14px',
    lg: '16px',
    xl: '18px'
  },
  components: {
    Code: {
      styles: {
        root: {
          fontFamily: monoFamily
        }
      }
    },
    Table: {
      defaultProps: {
        highlightOnHover: true,
        verticalSpacing: 'xs',
        horizontalSpacing: 'md'
      }
    }
  }
})

export const mono = monoFamily
