import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-ui font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-status-error-ink" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-ink-muted">{hint}</p>
      )}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ className, invalid, ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-ui text-ink shadow-soft outline-none transition-[border-color,box-shadow]',
        'placeholder:text-ink-muted focus:border-accent-300 focus:ring-3 focus:ring-accent-100',
        invalid && 'border-status-error/60 focus:border-status-error/60 focus:ring-status-error/15',
        className
      )}
      {...props}
    />
  )
}
