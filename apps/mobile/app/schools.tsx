import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ADMIN_OWNED_STAGES, BA_ACTION_STAGES, formatNairobiDisplay } from '@fazoo/config';
import type { BaPipelineJob, BooklistStage } from '@fazoo/types';
import { nextActionFor, useSchoolPipeline } from '@/lib/booklist';
import { operationCounts } from '@/lib/offline/db';
import { flushQueue } from '@/lib/offline/sync';
import { PrimaryButton } from '@/components/primary-button';
import { StatusPill } from '@/components/status-pill';
import { StageBadge } from '@/components/stage-badge';
import { ChipRow, type ChipOption } from '@/components/choice';
import { Card, EmptyState, Field, MetricTile, Page, ScreenHeader } from '@/components/ui';

/** Print run and logistics — the stages the BA watches rather than drives. */
const DELIVERY_STAGES: readonly BooklistStage[] = ['in_production', 'dispatched', 'received'];

const FILTERS: readonly ChipOption[] = [
  { code: null, label: 'All' },
  { code: 'action', label: 'My action needed' },
  { code: 'admin', label: 'With admin' },
  { code: 'delivery', label: 'Printing & delivery' },
  { code: 'completed', label: 'Completed' },
  { code: 'declined', label: 'Declined' },
];

function matchesFilter(job: BaPipelineJob, filter: string | null): boolean {
  switch (filter) {
    case 'action':
      return BA_ACTION_STAGES.includes(job.stage);
    case 'admin':
      return ADMIN_OWNED_STAGES.includes(job.stage);
    case 'delivery':
      return DELIVERY_STAGES.includes(job.stage);
    case 'completed':
      return job.stage === 'completed';
    case 'declined':
      return job.stage === 'declined';
    default:
      return true;
  }
}

function matchesQuery(job: BaPipelineJob, term: string): boolean {
  if (!term) return true;
  return (
    job.school_name.toLowerCase().includes(term) ||
    (job.school_region ?? '').toLowerCase().includes(term)
  );
}

/**
 * The pipeline list: every school this BA has engaged, searchable, each showing
 * the exact point of the process it is at. Filtering happens client-side over
 * the cached pipeline so it still works with no connection at the gate.
 */
export default function Schools() {
  const pipeline = useSchoolPipeline();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    await flushQueue();
    setPending((await operationCounts()).pending);
    await pipeline.refresh();
  }, [pipeline.refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const jobs = pipeline.data?.jobs ?? [];
  const counts = pipeline.data?.counts;
  const term = query.trim().toLowerCase();

  const visible = useMemo(
    () => jobs.filter((job) => matchesFilter(job, filter) && matchesQuery(job, term)),
    [jobs, filter, term],
  );

  async function pullToRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setFilter(null);
  }

  return (
    <Page
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void pullToRefresh()}
          tintColor="#7B2FBE"
          colors={['#7B2FBE']}
        />
      }
    >
      <ScreenHeader
        eyebrow="Pipeline"
        title="All schools"
        subtitle={
          counts
            ? `${counts.total} logged · ${counts.active} active · ${counts.awaiting_admin} with admin`
            : 'Where every school you have approached currently stands.'
        }
        onBack={() => router.back()}
      />

      <Field
        label="Search a school"
        placeholder="Type any part of the school or region name"
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        value={query}
        onChangeText={setQuery}
      />

      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />

      {pipeline.loading && !pipeline.data ? (
        <View className="items-center py-12">
          <ActivityIndicator size="large" color="#7B2FBE" />
        </View>
      ) : (
        <>
          <View className="mb-4 flex-row gap-3">
            <MetricTile label="In progress" value={counts?.active ?? 0} />
            <MetricTile label="Completed" value={counts?.completed ?? 0} tone="success" />
            <MetricTile label="Declined" value={counts?.declined ?? 0} />
          </View>

          {pending > 0 ? (
            <StatusPill
              tone="warn"
              label={`${pending} change${pending > 1 ? 's' : ''} waiting to sync — new schools appear here once they upload`}
            />
          ) : null}
          {pipeline.error ? <StatusPill tone="bad" label={pipeline.error} /> : null}

          <View className="mt-4">
            <PrimaryButton
              label="Start a school visit"
              icon="camera"
              onPress={() => router.push('/school-visit')}
            />
          </View>

          <View className="mb-2 mt-6 flex-row items-center justify-between">
            <Text className="font-sans text-sm font-semibold uppercase tracking-[2px] text-muted">
              {visible.length} school{visible.length === 1 ? '' : 's'}
            </Text>
            {term || filter ? (
              <TouchableOpacity
                onPress={clearSearch}
                accessibilityRole="button"
                accessibilityLabel="Clear search and filters"
                className="min-h-11 justify-center px-2"
              >
                <Text className="font-sans text-sm font-semibold text-primaryText">Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {jobs.length === 0 ? (
            <EmptyState
              title="No schools logged yet"
              body="Approach a school, take your gate selfie, and ask for their booklist. Every school you log shows up here with the point of the process it is at."
              actionLabel="Start a school visit"
              onAction={() => router.push('/school-visit')}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No school matches that"
              body="Try fewer words, or clear the filters to see every school you have logged."
              actionLabel="Clear filters"
              onAction={clearSearch}
            />
          ) : (
            <View className="gap-3">
              {visible.map((job) => (
                <Card key={job.job_id}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/school-job', params: { job: job.job_id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${job.school_name}. ${nextActionFor(job.stage, job.formatted_ready)}`}
                    accessibilityHint="Opens the full history for this school"
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

                    <Text className="font-sans mt-3 text-sm leading-6 text-ink">
                      {nextActionFor(job.stage, job.formatted_ready)}
                    </Text>

                    {job.copies_to_print ? (
                      <Text className="font-sans mt-2 text-sm font-semibold text-ink">
                        {job.copies_to_print} to print ({job.copies_requested} requested + 1 stamped copy)
                      </Text>
                    ) : null}

                    <View className="mt-3 flex-row flex-wrap items-center gap-2">
                      {job.document_received_at ? (
                        <Tag label={`Booklist ${formatNairobiDisplay(job.document_received_at)}`} />
                      ) : null}
                      {job.dispatched_at ? (
                        <Tag label={`Dispatched ${formatNairobiDisplay(job.dispatched_at)}`} />
                      ) : null}
                      {job.received_at ? (
                        <Tag label={`Received ${formatNairobiDisplay(job.received_at)}`} />
                      ) : null}
                      {job.stamped_uploaded ? <Tag label="Stamped copy on file" /> : null}
                    </View>

                    <Text className="font-sans mt-3 text-xs text-muted">
                      Updated {formatNairobiDisplay(job.stage_updated_at)}
                    </Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}

          {jobs.length > visible.length && visible.length > 0 ? (
            <Text className="font-sans mt-5 text-center text-sm text-muted">
              {jobs.length - visible.length} more school{jobs.length - visible.length === 1 ? '' : 's'} hidden by
              your search or filter.
            </Text>
          ) : null}
        </>
      )}
    </Page>
  );
}

/** Small dated fact chip — text only, so nothing is conveyed by colour alone. */
function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-edge bg-lavender px-3 py-1.5">
      <Text className="font-sans text-xs font-medium text-ink">{label}</Text>
    </View>
  );
}
