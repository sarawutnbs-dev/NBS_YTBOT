"use client";

import { Button } from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { signIn } from "next-auth/react";

export default function LoginButton() {
  return (
    <Button type="primary" icon={<GoogleOutlined />} onClick={() => signIn("google")}>
      Continue with Google
    </Button>
  );
}
