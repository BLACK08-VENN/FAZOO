import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, Td, Th } from '@/components/ui/table';
import { DEFAULT_GEOFENCE_RADIUS_METRES } from '@fazoo/config';
import { storeInputSchema } from '@fazoo/validation';

export default async function StoresPage() {
  const { client } = await requireStaff();
  const { data: stores } = await client.from('stores').select('*').order('name');

  return (
    <>
      <PageHeader title="Stores" description="Locations and geofence radii." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Address</Th>
                <Th className="text-right">Radius</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(stores ?? []).map((s) => (
                <tr key={s.id} className="hover:bg-lavender/60">
                  <Td className="font-medium">
                    <Link href={`/stores/${s.id}`} className="text-deep underline">{s.name}</Link>
                  </Td>
                  <Td className="text-muted">{s.address ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{s.geofence_radius_metres} m</Td>
                  <Td>{s.status}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <Card>
          <CardHeader title="Add a store" description="Coordinates come from your map tool of choice." />
          <CardBody>
            <form
              action={async (formData: FormData) => {
                'use server';
                const parsed = storeInputSchema.safeParse({
                  name: formData.get('name'),
                  address: formData.get('address') || null,
                  latitude: Number(formData.get('latitude')),
                  longitude: Number(formData.get('longitude')),
                  geofence_radius_metres:
                    Number(formData.get('radius')) || DEFAULT_GEOFENCE_RADIUS_METRES,
                  status: 'active',
                });
                if (!parsed.success) return;
                const { client: c } = await requireStaff();
                await c.from('stores').insert(parsed.data);
                revalidatePath('/stores');
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="s-name">Store name</Label>
                <Input id="s-name" name="name" required minLength={2} />
              </div>
              <div>
                <Label htmlFor="s-address">Address</Label>
                <Input id="s-address" name="address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="s-lat">Latitude</Label>
                  <Input id="s-lat" name="latitude" type="number" step="any" required />
                </div>
                <div>
                  <Label htmlFor="s-lng">Longitude</Label>
                  <Input id="s-lng" name="longitude" type="number" step="any" required />
                </div>
              </div>
              <div>
                <Label htmlFor="s-radius">Geofence radius (metres)</Label>
                <Input
                  id="s-radius"
                  name="radius"
                  type="number"
                  min={20}
                  max={2000}
                  defaultValue={DEFAULT_GEOFENCE_RADIUS_METRES}
                />
              </div>
              <Button type="submit" className="w-full">Create store</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
