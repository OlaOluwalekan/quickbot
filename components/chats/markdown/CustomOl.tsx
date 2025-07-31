import { Children, ReactNode } from 'react'

const CustomOl = ({ children, ...props }: { children: ReactNode }) => {
  const cleanChildren = Children.map(children, (child) =>
    typeof child === 'string' ? child.replace(/\n/g, '') : child
  )

  return (
    <ol
      {...props}
      style={{
        listStyleType: 'revert',
      }}
      className='pl-3.5 py-0 my-0'
    >
      {cleanChildren}
    </ol>
  )
}

export default CustomOl
