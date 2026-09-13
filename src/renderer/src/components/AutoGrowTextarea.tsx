import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'

/** A textarea that grows to fit its content instead of showing a manual drag-to-resize handle —
 *  `rows` still sets the starting/minimum height, it just won't stay stuck there. */
const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string
    onChange: (value: string) => void
    rows?: number
    placeholder?: string
    style?: React.CSSProperties
  } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows' | 'style'>
>(function AutoGrowTextarea({ value, onChange, rows = 3, placeholder, style, ...rest }, forwardedRef) {
  const innerRef = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(forwardedRef, () => innerRef.current!, [])

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={innerRef}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...rest}
    />
  )
})

export default AutoGrowTextarea
