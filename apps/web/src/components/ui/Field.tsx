import { Form, Input, Select } from 'antd';
import type { InputProps } from 'antd';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface BaseFieldProps {
  label: string;
  helper?: string;
  error?: string;
  className?: string;
}

interface TextFieldProps extends BaseFieldProps, InputHTMLAttributes<HTMLInputElement> {}
interface TextAreaFieldProps extends BaseFieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}
interface SelectFieldProps extends BaseFieldProps, SelectHTMLAttributes<HTMLSelectElement> {}

function FieldFrame({ label, helper, error, className = '', children }: BaseFieldProps & { children: React.ReactNode }) {
  return (
    <Form.Item
      className={['ui-field-ant', className].filter(Boolean).join(' ')}
      label={label}
      validateStatus={error ? 'error' : undefined}
      help={error ?? helper}
    >
      {children}
    </Form.Item>
  );
}

export function TextField({ label, helper, error, className, ...props }: TextFieldProps) {
  const { size, ...nativeInputProps } = props;
  void size;
  const inputProps = nativeInputProps as InputProps;
  return (
    <FieldFrame label={label} helper={helper} error={error} className={className}>
      <Input aria-invalid={Boolean(error)} {...inputProps} />
    </FieldFrame>
  );
}

export function TextAreaField({ label, helper, error, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldFrame label={label} helper={helper} error={error} className={className}>
      <Input.TextArea aria-invalid={Boolean(error)} {...props} />
    </FieldFrame>
  );
}

export function SelectField({ label, helper, error, className, children, ...props }: SelectFieldProps) {
  const options = Array.from(normalizeOptions(children));
  return (
    <FieldFrame label={label} helper={helper} error={error} className={className}>
      <Select
        aria-invalid={Boolean(error)}
        value={props.value as string | number | undefined}
        disabled={props.disabled}
        onChange={(value) => {
          props.onChange?.({ target: { value } } as React.ChangeEvent<HTMLSelectElement>);
        }}
        options={options}
      />
    </FieldFrame>
  );
}

function* normalizeOptions(children: React.ReactNode): Generator<{ value: string; label: React.ReactNode }> {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child || typeof child !== 'object' || !('props' in child)) continue;
    const props = child.props as { value?: string; children?: React.ReactNode };
    yield { value: String(props.value ?? ''), label: props.children };
  }
}
