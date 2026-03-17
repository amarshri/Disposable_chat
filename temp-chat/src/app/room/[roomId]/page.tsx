import RoomClient from "./room-client";

type RoomPageProps = {
  params: { roomId: string };
};

export default function RoomPage({ params }: RoomPageProps) {
  return <RoomClient roomId={params.roomId} />;
}
