/**
 * Badge.test.tsx
 *
 * Unit tests for RoleBadge and StatusBadge components.
 *
 * Tests cover:
 *  RoleBadge:
 *   - Renders the correct French label for every role
 *   - Applies role-specific CSS classes
 *   - size="sm" vs size="md" padding difference
 *  StatusBadge:
 *   - Renders the correct French label for every status
 *   - Applies status-specific CSS classes
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { RoleBadge, StatusBadge } from '../Badge';
import type { UserRole, UserStatus } from '@haccp/shared-types';

// ─── RoleBadge ────────────────────────────────────────────────────────────────

describe('RoleBadge', () => {
  const ROLE_LABELS: Record<UserRole, string> = {
    SUPER_ADMIN:     'Super Admin',
    ADMIN:           'Admin',
    MANAGER:         'Manager',
    QUALITY_OFFICER: 'Resp. Qualité',
    OPERATOR:        'Opérateur',
    VIEWER:          'Lecteur',
  };

  const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

  it.each(ROLES)('renders label "%s" for role %s', (role) => {
    render(<RoleBadge role={role} />);
    expect(screen.getByText(ROLE_LABELS[role])).toBeInTheDocument();
  });

  it('applies purple classes for SUPER_ADMIN', () => {
    render(<RoleBadge role="SUPER_ADMIN" />);
    expect(screen.getByText('Super Admin').className).toContain('bg-purple-100');
  });

  it('applies orange classes for MANAGER', () => {
    render(<RoleBadge role="MANAGER" />);
    expect(screen.getByText('Manager').className).toContain('bg-orange-100');
  });

  it('applies gray classes for OPERATOR', () => {
    render(<RoleBadge role="OPERATOR" />);
    expect(screen.getByText('Opérateur').className).toContain('bg-gray-100');
  });

  it('applies brand classes for ADMIN', () => {
    render(<RoleBadge role="ADMIN" />);
    expect(screen.getByText('Admin').className).toContain('text-brand-dark');
  });

  it('uses sm padding when size="sm"', () => {
    render(<RoleBadge role="ADMIN" size="sm" />);
    expect(screen.getByText('Admin').className).toContain('px-2 py-0.5');
  });

  it('uses md padding by default', () => {
    render(<RoleBadge role="ADMIN" />);
    expect(screen.getByText('Admin').className).toContain('px-2.5 py-1');
  });

  it('renders as a span element', () => {
    render(<RoleBadge role="VIEWER" />);
    expect(screen.getByText('Lecteur').tagName).toBe('SPAN');
  });
});

// ─── StatusBadge ──────────────────────────────────────────────────────────────

describe('StatusBadge', () => {
  const STATUS_LABELS: Record<UserStatus, string> = {
    ACTIVE:   'Actif',
    INACTIVE: 'Inactif',
    INVITED:  'Invité',
  };

  const STATUSES = Object.keys(STATUS_LABELS) as UserStatus[];

  it.each(STATUSES)('renders label for status %s', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
  });

  it('applies green classes for ACTIVE', () => {
    render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText('Actif').className).toContain('bg-green-100');
  });

  it('applies red classes for INACTIVE', () => {
    render(<StatusBadge status="INACTIVE" />);
    expect(screen.getByText('Inactif').className).toContain('bg-red-100');
  });

  it('applies yellow classes for INVITED', () => {
    render(<StatusBadge status="INVITED" />);
    expect(screen.getByText('Invité').className).toContain('bg-yellow-100');
  });

  it('renders as a span element', () => {
    render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText('Actif').tagName).toBe('SPAN');
  });
});
