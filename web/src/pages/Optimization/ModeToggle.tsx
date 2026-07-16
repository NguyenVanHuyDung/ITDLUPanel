import { Segmented, Space, Typography } from 'antd';
import { ToolOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ModeToggleProps {
  mode: string;
  onChange: (mode: string) => void;
}

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <Space>
      <Segmented
        value={mode}
        onChange={(value) => onChange(value as string)}
        options={[
          {
            label: (
              <Space>
                <ToolOutlined />
                <span>Manual</span>
              </Space>
            ),
            value: 'manual',
          },
          {
            label: (
              <Space>
                <ThunderboltOutlined />
                <span>Adaptive</span>
              </Space>
            ),
            value: 'adaptive',
          },
        ]}
      />
    </Space>
  );
}
