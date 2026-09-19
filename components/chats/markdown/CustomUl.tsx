import { Children, ReactNode } from 'react'

const CustomUl = ({ children, ...props }: { children: ReactNode }) => {
  const cleanChildren = Children.map(children, (child) =>
    typeof child === 'string' ? child.replace(/\n/g, '') : child
  )

  return (
    <ul
      style={{
        listStyleType: 'initial',
      }}
      {...props}
      className='pl-3.5 py-0 my-0'
    >
      {cleanChildren}
    </ul>
  )
}

export default CustomUl
