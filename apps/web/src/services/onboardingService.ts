import { authenticatedApiRequest } from './apiClient';
import type { LoginPayload } from '../types/api';

export type OnboardingPayload =
  | {
      identity: 'labeler';
      labeler_profile: {
        domains: string;
        qualification: string;
        task_types: string;
        experience?: string;
      };
    }
  | {
      identity: 'requester';
      organization_action: 'create';
      organization_profile: {
        company_name: string;
        industry: string;
        contact_name: string;
        contact_phone: string;
        business_description: string;
        website?: string;
        address?: string;
      };
    }
  | {
      identity: 'requester';
      organization_action: 'join';
      invite_code: string;
    };

export function completeOnboardingRequest(payload: OnboardingPayload): Promise<LoginPayload> {
  return authenticatedApiRequest<LoginPayload>('/auth/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
