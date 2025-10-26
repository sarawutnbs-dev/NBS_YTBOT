"use client";

import { useState } from "react";
import { Button, Select, Space, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { User } from "@prisma/client";
import axios from "axios";

import UserForm from "./UserForm.client";

type UsersTableProps = {
  initialUsers: User[];
  form?: React.ReactNode;
};

export default function UsersTable({ initialUsers }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const { data } = await axios.get<User[]>("/api/users");
      setUsers(data);
    } catch (error) {
      console.error(error);
      message.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(id: string, payload: Partial<User>) {
    try {
      setLoading(true);
      await axios.patch(`/api/users/${id}`, payload);
      message.success("User updated");
      reload();
    } catch (error) {
      console.error(error);
      message.error("Failed to update user");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setLoading(true);
      await axios.delete(`/api/users/${id}`);
      message.success("User removed");
      reload();
    } catch (error) {
      console.error(error);
      message.error("Failed to remove user");
    } finally {
      setLoading(false);
    }
  }

  const columns: ColumnsType<User> = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email"
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (value: User["role"], record: User) => (
        <Select<User["role"]>
          value={value}
          style={{ width: 120 }}
          onChange={(roleValue: User["role"]) => updateUser(record.id, { role: roleValue })}
          options={[
            { value: "ADMIN", label: "Admin" },
            { value: "USER", label: "User" }
          ]}
        />
      )
    },
    {
      title: "Allowed",
      dataIndex: "allowed",
      key: "allowed",
      render: (value: boolean, record: User) => (
        <Switch checked={value} onChange={(allowedValue: boolean) => updateUser(record.id, { allowed: allowedValue })} />
      )
    },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, record: User) => (
        <Tag color={record.allowed ? "green" : "red"}>{record.allowed ? "Enabled" : "Disabled"}</Tag>
      )
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: User) => (
        <Space>
          <Button danger onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <UserForm onCreated={reload} />
      <Table<User>
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={columns}
      />
    </>
  );
}
