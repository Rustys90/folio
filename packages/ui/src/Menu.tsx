import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from './cn';

export const MenuRoot = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuPortal = DropdownMenu.Portal;
export const MenuGroup = DropdownMenu.Group;
export const MenuSeparator = DropdownMenu.Separator;
export const MenuLabel = DropdownMenu.Label;

export type MenuContentProps = React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>;

/** Floating menu panel — liquid-glass surface. */
export function MenuContent({ className, sideOffset = 6, ...props }: MenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        data-slot="menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-card border border-hairline bg-glass p-1.5 shadow-glass',
          'backdrop-blur-xl backdrop-saturate-150',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'origin-top',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export interface MenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
  inset?: boolean;
}

/** A single menu row. */
export function MenuItem({ inset, className, ...props }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      data-slot="menu-item"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-control px-2.5 py-2 font-sans text-sm text-ink',
        'outline-none transition-colors duration-quick',
        'focus:bg-accent-soft focus:text-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

export type MenuCheckboxItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenu.CheckboxItem
>;

/** Toggleable menu row with check indicator. */
export function MenuCheckboxItem({ children, className, ...props }: MenuCheckboxItemProps) {
  return (
    <DropdownMenu.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-control py-2 pl-8 pr-2.5 font-sans text-sm text-ink',
        'outline-none transition-colors duration-quick',
        'focus:bg-accent-soft',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="h-4 w-4" aria-hidden />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}
