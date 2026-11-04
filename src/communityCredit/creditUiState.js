// Workflow availability must never be interpreted as policy configuration.
export const creditAvailabilityMessage = error => {
  if (['42501','PGRST301','PGRST302','PGRST303'].includes(error?.code)) return 'Your account is not authorized for V2 workflows. Check your session and permissions.'
  if (['PGRST202','42883'].includes(error?.code)) return 'V2 functions are missing from this database or its API schema. This does not mean the current policy is unconfigured.'
  return 'V2 workflows are unavailable. Check your connection and try again. The current policy is unchanged.'
}
