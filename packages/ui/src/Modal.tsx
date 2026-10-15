import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';

export const ModalRoot = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export type ModalContentProps = React.ComponentPropsWithoutRef<typeof Dialog.Content>;

/** Centered dialog — glass surface, calm entrance. */
export function ModalContent({ className, children, ...props }: ModalContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay
        data-slot="modal-overlay"
        className={cn(
          'fixed inset-0 z-50 bg-ink/20 backdrop-blur-sm',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        )}
      />
      <Dialog.Content
        data-slot="modal-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-card border border-hairline bg-glass p-6 shadow-glass',
          'backdrop-blur-xl backdrop-saturate-150',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close
          aria-label="Close"
          className={cn(
            'absolute right-4 top-4 rounded-control p-1 text-ink-soft',
            'transition-colors duration-quick hover:bg-accent-soft hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
        >
          <X className="h-4 w-4" aria-hidden />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export type ModalTitleProps = React.ComponentPropsWithoutRef<typeof Dialog.Title>;

/** Dialog heading — serif, per Folio's manuscript voice. */
export function ModalTitle({ className, ...props }: ModalTitleProps) {
  return (
    <Dialog.Title
      data-slot="modal-title"
      className={cn('font-display text-xl text-ink', className)}
      {...props}
    />
  );
}

export type ModalDescriptionProps = React.ComponentPropsWithoutRef<
  typeof Dialog.Description
>;

/** Dialog subtext. */
export function ModalDescription({ className, ...props }: ModalDescriptionProps) {
  return (
    <Dialog.Description
      data-slot="modal-description"
      className={cn('mt-1.5 font-sans text-sm text-ink-soft', className)}
      {...props}
    />
  );
}
