import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Upload,
  message,
  Popconfirm,
  Image,
  Space,
} from "antd";
import { Plus, Edit, Trash2, UploadCloud } from "lucide-react";
import {
  listHeroBanners,
  createHeroBanner,
  updateHeroBanner,
  deleteHeroBanner,
  uploadBannerImage,
  getBannerImageUrl,
} from "@/data/appwrite-repository";
import type { HeroBanner } from "@/lib/domain";

export function BannersManager() {
  const queryClient = useQueryClient();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBanner | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => listHeroBanners(true),
  });

  const createMutation = useMutation({
    mutationFn: createHeroBanner,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      message.success("Banner created successfully");
      setIsModalVisible(false);
      form.resetFields();
    },
    onError: (error: any) => message.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HeroBanner> }) =>
      updateHeroBanner(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      message.success("Banner updated successfully");
      setIsModalVisible(false);
      form.resetFields();
    },
    onError: (error: any) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHeroBanner,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      message.success("Banner deleted successfully");
    },
    onError: (error: any) => message.error(error.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateHeroBanner(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      message.success("Banner status updated");
    },
  });

  const handleOpenModal = (banner?: HeroBanner) => {
    if (banner) {
      setEditingBanner(banner);
      form.setFieldsValue(banner);
      setFileList([
        {
          uid: "-1",
          name: "image.png",
          status: "done",
          url: banner.imageUrl,
        },
      ]);
    } else {
      setEditingBanner(null);
      form.resetFields();
      form.setFieldsValue({ isActive: true, sortOrder: 0 });
      setFileList([]);
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setFileList([]);
  };

  const handleSubmit = async (values: any) => {
    try {
      let imageId = editingBanner?.imageId;
      let imageUrl = editingBanner?.imageUrl;

      const file = fileList[0]?.originFileObj;
      if (file) {
        imageId = await uploadBannerImage(file);
        imageUrl = getBannerImageUrl(imageId);
      }

      if (!imageId) {
        message.error("Please upload an image");
        return;
      }

      const payload = {
        title: values.title,
        imageId,
        imageUrl,
        linkUrl: values.linkUrl,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
        startDate: values.startDate ? values.startDate.toISOString() : null,
        endDate: values.endDate ? values.endDate.toISOString() : null,
      };

      if (editingBanner) {
        updateMutation.mutate({ id: editingBanner.id, data: payload });
      } else {
        createMutation.mutate(payload as any);
      }
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const columns = [
    {
      title: "Image",
      dataIndex: "imageUrl",
      key: "imageUrl",
      render: (url: string) => <Image src={url} width={80} className="rounded-md object-cover" />,
    },
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
    },
    {
      title: "Order",
      dataIndex: "sortOrder",
      key: "sortOrder",
    },
    {
      title: "Status",
      key: "isActive",
      render: (text: any, record: HeroBanner) => (
        <Switch
          checked={record.isActive}
          onChange={(checked) => toggleActiveMutation.mutate({ id: record.id, isActive: checked })}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (text: any, record: HeroBanner) => (
        <Space>
          <Button type="text" icon={<Edit size={16} />} onClick={() => handleOpenModal(record)} />
          <Popconfirm
            title="Delete this banner?"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="text" danger icon={<Trash2 size={16} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold m-0 text-slate-800">Banners Manager</h2>
          <p className="text-secondary text-gray-500 m-0">
            Manage the hero carousel banners on the landing page.
          </p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => handleOpenModal()}
          className="rounded-full bg-gradient-primary hover:opacity-90 text-white border-none shadow-soft"
        >
          Add Banner
        </Button>
      </div>

      <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-soft">
        <Table
          scroll={{ x: "max-content" }}
          dataSource={banners}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          className="overflow-x-auto"
        />
      </div>

      <Modal
        title={editingBanner ? "Edit Banner" : "Create Banner"}
        open={isModalVisible}
        onCancel={handleCancel}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnClose
        okButtonProps={{ className: "bg-primary text-white rounded-full border-none" }}
        cancelButtonProps={{ className: "rounded-full" }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <Form.Item
            label="Banner Image"
            required
            extra={
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <p>
                  <strong>Recommended:</strong> 1920×650 for desktop banners.
                </p>
                <p>
                  <strong>Mobile Recommended:</strong> 1080×1400.
                </p>
              </div>
            }
          >
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={(file) => {
                return new Promise((resolve) => {
                  const img = new window.Image();
                  img.src = URL.createObjectURL(file);
                  img.onload = () => {
                    const ratio = img.width / img.height;
                    if (ratio < 1.2 && img.width > 1200) {
                      message.warning(
                        "Image is very tall. It might be cropped heavily on desktop screens. Consider a wider image.",
                      );
                    } else if (ratio > 4) {
                      message.warning(
                        "Image is extremely wide. It might be cropped heavily on mobile screens.",
                      );
                    }
                    resolve(false);
                  };
                  img.onerror = () => resolve(false);
                });
              }}
              maxCount={1}
            >
              {fileList.length >= 1 ? null : (
                <div>
                  <UploadCloud size={24} className="mx-auto text-gray-400" />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.Item name="title" label="Title (Internal)">
            <Input placeholder="e.g. Summer Sale" />
          </Form.Item>
          <Form.Item name="linkUrl" label="Destination URL (Optional)">
            <Input placeholder="https://..." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="sortOrder" label="Sort Order" rules={[{ required: true }]}>
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="isActive" label="Active Status" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
