// Loads a person's history and their descriptive analytics together, without
// letting an analytics failure hide the history.
//
// The history is the record an official came for; the analytics are a summary
// of it. So a failed history is a failure (it rejects), while a failed
// analytics request only marks the analytics as unavailable and the history
// still opens. Pure: both loaders are passed in.
export const settlePersonRecord = async (loadHistory, loadAnalytics) => {
  const [history, analytics] = await Promise.allSettled([loadHistory(), loadAnalytics()])
  if (history.status === 'rejected') throw history.reason
  return {
    ...history.value,
    analytics: analytics.status === 'fulfilled' ? analytics.value : null,
    analyticsUnavailable: analytics.status === 'rejected',
  }
}
