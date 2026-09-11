import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, TouchableOpacity, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { agencyLabel } from '@fazoo/config';
import { nextActionFor, useSchoolPipeline, useVisitStats } from '@/lib/booklist';
import { operationCounts, retryTerminal } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { StageBadge } from '@/components/stage-badge';
import { Card, EmptyState, GlassCard, HeroCard, MetricTile, Page, Screen, SectionLabel } from '@/components/ui';

const PREVIEW_LIMIT = 5;

/** School-programme dashboard: who the BA is, how many schools they reached,
 *  and where every engaged school currently sits in the booklist journey. */
export default function SchoolsToday() {
  const stats = useVisitStats();
  const pipeline = useSchoolPipeline();
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [online, setOnline] = useState<boolean | null>(null);

  async function refreshCounts() {
    setCounts(await operationCounts());
  }

  useEffect(() => {
    void refreshCounts();
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected) void flushQueue().then(refreshCounts);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushQueue().then(refreshCounts);
    });
    return () => {
      unsubscribeNetInfo();
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void flushQueue();
      void refreshCounts();
      void stats.refresh();
      void pipeline.refresh();
    }, [stats.refresh, pipeline.refresh]),
  );

  if (stats.loading && !stats.data) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      </Screen>
    );
  }

  const data = stats.data;
  const monthlyTarget = data?.target?.target_schools ?? data?.default_target_schools_per_month ?? null;
  const visitedThisMonth = data?.schools_visited_this_month ?? 0;
  const targetDaily = data?.target_daily_schools ?? null;
  const visitedToday = data?.schools_visited_today ?? 0;
  const selfieRequired = data?.selfie_required ?? false;
  const jobs = pipeline.data?.jobs ?? [];
  const activeJobs = jobs.filter((job) => job.stage !== 'completed' && job.stage !== 'cancelled');

  return (
    <Page bottomInset={false}>
      <HeroCard
        eyebrow={`Today · ${data?.today ?? '—'} (Kenya)`}
        title="School booklists"
        subtitle={`${online === false ? 'Offline' : 'Ready'} · Track each school from visit to stamped copy.`}
        icon="school"
      />

      <GlassCard className="mb-4">
        <Text className="font-sans text-xs uppercase tracking-[2px] text-muted">Your agency</Text>
        <Text className="font-sans mt-1 text-lg font-bold text-ink">{agencyLabel(data?.agency)}</Text>
        <Text className="font-sans mt-1.5 text-sm leading-5 text-muted">
          {selfieRequired
            ? 'Gate selfie required · GPS recorded'
            : 'Gate selfie optional · GPS recorded'}
          {data?.geofence_enforced ? ' · Geofence enforced' : ''}
        </Text>
      </GlassCard>

      <View className="mb-4 flex-row gap-3">
        <MetricTile
          label="Schools this month"
          value={monthlyTarget === null ? `${visitedThisMonth}` : `${visitedThisMonth} / ${monthlyTarget}`}
          tone={monthlyTarget !== null && visitedThisMonth >= monthlyTarget ? 'success' : 'default'}
        />
        <MetricTile label="Booklists collected" value={data?.booklists_collected ?? 0} />
      </View>

      <View className="mb-4 flex-row gap-3">
        <MetricTile
          label="Schools today"
          value={targetDaily !== null ? `${visitedToday} / ${targetDaily}` : `${visitedToday}`}
          tone={
            targetDaily !== null && visitedToday >= targetDaily
              ? 'success'
              : targetDaily !== null
                ? 'warning'
                : 'default'
          }
        />
        <MetricTile label="Declines logged" value={data?.declines_recorded ?? 0} />
      </View>

      {targetDaily !== null && visitedToday < targetDaily ? (
        <StatusPill
          tone="warn"
          label={`${visitedToday} of ${targetDaily} schools logged today — keep going`}
        />
      ) : targetDaily !== null ? (
        <StatusPill tone="ok" label={`Daily target met — ${visitedToday} schools logged today`} />
      ) : null}

      {selfieRequired && data && data.selfie_compliance.missing > 0 ? (
        <StatusPill
          tone="warn"
          label={`${data.selfie_compliance.missing} visit${data.selfie_compliance.missing > 1 ? 's' : ''} missing a selfie`}
        />
      ) : null}

      <PrimaryButton
        label="Start a school visit"
        icon="camera"
        onPress={() => router.push('/school-visit')}
      />
      <PrimaryButton
        label="All schools & status"
        variant="secondary"
        icon="list"
        onPress={() => router.push('/schools')}
      />

      {online === false ? (
        <StatusPill tone="warn" label={`Offline · ${counts.pending} waiting to sync`} />
      ) : counts.failed > 0 ? (
        <View>
          <StatusPill tone="bad" label={`${counts.failed} item${counts.failed > 1 ? 's' : ''} need attention`} />
          <PrimaryButton
            label="Retry failed items"
            variant="ghost"
            onPress={() => void retryTerminal().then(() => flushQueue()).then(refreshCounts)}
          />
        </View>
      ) : counts.pending > 0 ? (
        <StatusPill tone="warn" label={`Waiting to sync · ${counts.pending} item${counts.pending > 1 ? 's' : ''}`} />
      ) : null}

      {stats.error ? <StatusPill tone="bad" label={stats.error} /> : null}
      {pipeline.error ? <StatusPill tone="bad" label={pipeline.error} /> : null}

      <SectionLabel>In progress</SectionLabel>

      {activeJobs.length === 0 ? (
        <EmptyState
          title="No schools in progress"
          body="Approach a school, take your gate selfie, and ask for their booklist. Every school you log shows up here with its current stage."
          actionLabel="Start a school visit"
          onAction={() => router.push('/school-visit')}
        />
      ) : (
        <View className="gap-3">
          {activeJobs.slice(0, PREVIEW_LIMIT).map((job) => (
            <Card key={job.job_id}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/school-job', params: { job: job.job_id } })}
                accessibilityRole="button"
                accessibilityLabel={`${job.school_name}, ${job.stage.replaceAll('_', ' ')}`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-sans text-lg font-bold text-ink">{job.school_name}</Text>
                    {job.school_region ? (
                      <Text className="font-sans mt-1 text-sm text-muted">{job.school_region}</Text>
                    ) : null}
                  </View>
                  <StageBadge stage={job.stage} />
                </View>
                <Text className="font-sans mt-3 text-sm leading-6 text-muted">
                  {nextActionFor(job.stage, job.formatted_ready)}
                </Text>
                {job.copies_to_print ? (
                  <Text className="font-sans mt-2 text-sm font-semibold text-ink">
                    {job.copies_to_print} to print ({job.copies_requested} requested + 1 stamped copy)
                  </Text>
                ) : null}
              </TouchableOpacity>
            </Card>
          ))}

          {activeJobs.length > PREVIEW_LIMIT ? (
            <PrimaryButton
              label={`See all ${activeJobs.length} schools`}
              variant="ghost"
              onPress={() => router.push('/schools')}
            />
          ) : null}
        </View>
      )}

      <Card className="mt-6">
        <Text className="font-sans mb-2 text-base font-bold text-ink">Need time off?</Text>
        <Text className="font-sans mb-3 text-sm leading-6 text-muted">
          Request annual, sick, or other leave that an admin will review.
        </Text>
        <PrimaryButton
          label="Apply for leave"
          variant="secondary"
          icon="calendar-clear"
          onPress={() => router.push('/leave')}
        />
      </Card>

      <Text className="font-sans mb-24 mt-8 text-center text-xs text-muted">Fazoo · v0.1</Text>
    </Page>
  );
}
