import { useState } from "react";
import { Button, Input } from "@project/ui";
import { prisma, User } from "@project/prisma";
import { tryMe } from "@project/constants";

export default function Web({ users }: { users: User[] }) {
  const [value, setValue] = useState("");

  const handleClick = async () => {
    fetch("http://localhost:5000/write-new-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: value }),
    })
      .then((res) => res.json())
      .then((res) => console.log(res));
  };

  return (
    <div>
      <h1>Welcome to the test image!</h1>
      <Button />
      <p>
        This is a constant that comes from the {"@project/constants"} package:
        <span> {tryMe}</span>
      </p>
      <p>Here are all the users currently in your database.</p>
      <pre>{JSON.stringify(users, null, 2)}</pre>
      <Input value={value} setValue={setValue} />
      <Button onClick={() => handleClick()}>Create a new user</Button>
    </div>
  );
}

export const getStaticProps = async () => {
  const users = await prisma.user.findMany();

  return {
    props: {
      users,
    },
  };
};
