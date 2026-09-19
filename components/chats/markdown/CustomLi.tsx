import { Children, ReactNode } from 'react'

const CustomLi = ({ children, ...props }: { children: ReactNode }) => {
  /**
   * Processes the input `child`. If `child` is a string, it removes all newline characters.
   * Otherwise, it returns the `child` unchanged.
   *
   * @param {string|*} child - The input to be processed, which can be a string or any other type.
   * @returns {string|*} - The processed string with newlines removed if it was a string, or the original `child` if not.
   */
  const cleanChildren = Children.map(children, (child) =>
    typeof child === 'string' ? child.replace(/\n/g, '') : child
  )

  return (
    <li {...props} className=''>
      {cleanChildren}
    </li>
  )
}

export default CustomLi
